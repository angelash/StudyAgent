import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {z} from 'zod';
import type {PaperCaptureGroupView} from '@study-agent/contracts';
import {InMemoryStoreService,type InMemoryUserAccount,type InMemoryAuthSession} from '../../infrastructure/in-memory-store.service';
import {validate} from '../../common/validation';
import {PaperCaptureCommandService} from './paper-capture-command.service';
import {preparePaperCaptureCommand,type PaperCaptureGroupRecord} from './paper-capture-record';
import {preparePaperCaptureGroup} from './paper-capture-group';
import {assertPaperCaptureGroupRecord,retainedPaperCapturePage} from './paper-capture-group-record';

const querySchema=z.object({studentId:z.string().min(1).max(180).optional(),subject:z.enum(['math','chinese','english','chemistry']).optional()}).strict().refine(row=>Boolean(row.studentId)===Boolean(row.subject));
@Injectable()
export class PaperCaptureGroupService{
 constructor(private readonly store:InMemoryStoreService,private readonly commands:PaperCaptureCommandService){}
 private group(user:InMemoryUserAccount,id:string){const row=this.store.find('paperCaptureGroups',{id});if(!row)throw new NotFoundException('原采集组不存在。');this.commands.audience(user,row.attribution.scope);return row;}
 private view(user:InMemoryUserAccount,row:PaperCaptureGroupRecord):PaperCaptureGroupView{return{id:row.id,scope:structuredClone(row.attribution.scope),revision:row.revision,createdAt:row.attribution.createdAt,ownerClosed:row.attribution.ownerUserId===null,
  canEdit:row.attribution.ownerUserId===user.id&&(user.role!=='student'||Boolean(this.store.find('subjectEnrollments',{studentId:row.attribution.scope.studentId,subject:row.attribution.scope.subject,enabled:true}))),history:structuredClone(row.history),current:structuredClone(row.history.at(-1)!.version)};}
 get(user:InMemoryUserAccount,id:string){return this.view(user,this.group(user,id));}
 list(user:InMemoryUserAccount,value:unknown){const query=validate(querySchema,value),scope=this.commands.scope(user,query.studentId??null,query.subject??null),rows=this.store.select('paperCaptureGroups',{'attribution.scope.studentId':scope.studentId,'attribution.scope.subject':scope.subject,...(!scope.studentId?{'attribution.scope.creatorFingerprint':scope.creatorFingerprint}:{})});return rows.map(row=>this.view(user,row));}
 async revise(user:InMemoryUserAccount,id:string,value:unknown,session:InMemoryAuthSession){
  const command=this.commands.parse(value);if(command.kind!=='groupRevision'||command.groupId!==id||!/^paper_group_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))throw new BadRequestException('请使用原采集组身份和完整页序修订命令。');
  return this.commands.transaction(()=>{
   const existing=this.store.find('paperCaptureGroups',{id}),first=this.store.find('paperCapturePages',{id:command.input.pages[0].pageId});if(!first)throw new NotFoundException('原页尚未完整保存，请先核对上传结果。');
   const scope=existing?.attribution.scope??first.attribution.scope;this.commands.writer(user,scope);if(existing&&existing.attribution.ownerUserId!==user.id||!existing&&first.attribution.ownerUserId!==user.id)throw new ForbiddenException('只有原作者可以修订这份采集组。');
   const actualSession=this.store.find('sessions',{id:session.id,userId:user.id,revokedAt:null});if(!actualSession||Date.parse(actualSession.expiresAt)<=Date.now())throw new ForbiddenException('原采集确认的登录授权已变化，请重新核对。');
   if(user.role==='student'){const guardian=this.store.find('users',{id:session.guardianId,status:'active',role:['parent','admin']});if(!guardian||!this.store.find('studentLearningAccess',{studentId:scope.studentId,userId:user.id,status:'enabled',version:session.accessVersion})||guardian.role!=='admin'&&!this.store.find('bindings',{studentId:scope.studentId,parentUserId:guardian.id,status:'active'}))throw new ForbiddenException('原采集确认的学习授权已变化，请重新核对。');}
   const prior=this.commands.existing(user,scope,command);if(prior){if(prior.status!=='committed')throw new ConflictException('请先核对这份原采集组命令。');return structuredClone(prior.result!);}
   if(command.input.expectedRevision!==(existing?.revision??0))throw new ConflictException('采集组页序或用途已变化，请保留当前选择并核对原修订。');if(existing&&existing.revision>=1000)throw new ConflictException('采集组修订数量已达上限，请保留原历史后新建采集组。');
   const pageIds=[...new Set([...(existing?.history.flatMap(saved=>saved.version.pages.map(page=>page.pageId))??[]),...command.input.pages.map(page=>page.pageId)])],pages=this.store.select('paperCapturePages',{id:pageIds}),at=new Date().toISOString();let version:ReturnType<typeof preparePaperCaptureGroup>;
   try{version=preparePaperCaptureGroup(id,scope,command.input,pages.map(retainedPaperCapturePage),existing?.history.at(-1)?.version);}catch{throw new BadRequestException('原页、处理版本、用途页数或资料范围不一致，请保留页序并重新核对。');}
   const row:PaperCaptureGroupRecord=existing??{protocol:'paper-capture-group-record-v1',id,attribution:{protocol:'paper-capture-attribution-v1',scope:structuredClone(scope),ownerUserId:user.id,createdAt:at},revision:version.revision,history:[]};
   row.history.push({version,at});row.revision=version.revision;assertPaperCaptureGroupRecord(row,pages);if(!existing)this.store.append('paperCaptureGroups',row);
   const result={kind:'groupRevision',groupId:id,revision:row.revision,fingerprint:version.fingerprint,savedAt:at};this.store.append('paperCaptureCommands',preparePaperCaptureCommand(user.id,scope,command,result,at));return result;
  });
 }
}
