import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import type {PaperCaptureDerivationView} from '@study-agent/contracts';
import {InMemoryStoreService,type InMemoryUserAccount,type InMemoryAuthSession} from '../../infrastructure/in-memory-store.service';
import type {TaskRow} from '../../infrastructure/task-repository';
import {retentionDigest} from '../diagnostics/retention-anchor';
import {PaperCaptureCommandService} from './paper-capture-command.service';
import {preparePaperCaptureCommand,assertPaperCaptureCommand,type PaperCaptureCommandRecord} from './paper-capture-record';
import {assertPaperCaptureGroupRecord} from './paper-capture-group-record';
import {assertPaperCaptureDerivation,paperCaptureDerivationKind,paperCaptureDerivationPayload,type PaperCaptureDerivationRecord} from './paper-capture-derivation-record';
import {PAPER_DERIVED_PDF_LIMITS} from './paper-capture-derived-pdf';
import {materialTaskStatus} from './studio-material-access';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {withStudioFileLease,assertNoFileLinks} from '../../infrastructure/studio-file-coordination';
import {verifyImmutableFile} from '../../infrastructure/immutable-files';
import {studioMaterialRoot} from './studio-material-storage';
import {paperCaptureFileId} from './paper-capture-record';

const active=['queued','running','retry_wait','cancel_requested'];
@Injectable()
export class PaperCaptureDerivationService{
 constructor(private readonly store:InMemoryStoreService,private readonly commands:PaperCaptureCommandService){}
 private sourceGroup(user:InMemoryUserAccount,id:string){const row=this.store.find('paperCaptureGroups',{id});if(!row)throw new NotFoundException('原采集组不存在，请先核对保存结果。');this.commands.audience(user,row.attribution.scope);return row;}
 private record(user:InMemoryUserAccount,id:string,control=false){const row=this.store.find('paperCaptureDerivations',{id});if(!row)throw new NotFoundException('原图片识别任务不存在。');this.commands.audience(user,row.attribution.scope);if(control&&row.attribution.ownerUserId!==user.id)throw new ForbiddenException('请由发起这次识别的本人操作；当前监护人可以从合法共享组新建自己的识别。');return row;}
 async get(user:InMemoryUserAccount,id:string){const row=this.record(user,id),task=await this.store.tasks.get(row.taskId);return this.view(user,row,task);}
 async list(user:InMemoryUserAccount,groupId:string){this.sourceGroup(user,groupId);const rows=this.store.select('paperCaptureDerivations',{groupId});return Promise.all(rows.map(async row=>this.view(user,row,await this.store.tasks.get(row.taskId))));}
 async pdf(user:InMemoryUserAccount,id:string){
  const row=this.record(user,id);if(!row.pdf)throw new ConflictException('这次派生PDF还没有完成，请先查看原识别进度。');
  const receipt=structuredClone(row.pdf),root=studioMaterialRoot(),key=paperCaptureFileId('pdf',receipt.pdfSha256);
  return withStudioFileLease(root,'paper-file',key,async()=>{
   const check=()=>{const current=this.record(user,id),asset=this.store.find('paperCaptureFileAssets',{id:key,state:'available'});if(current.pdf?.fingerprint!==receipt.fingerprint||!asset||asset.bytes!==receipt.pdfBytes)throw new ConflictException('这份派生原件正在恢复或回收。');};
   await this.store.requestContext(check);const path=resolve(root,'paper-images/pdf',receipt.pdfSha256+'.pdf');await assertNoFileLinks(path);await verifyImmutableFile(path,receipt.pdfSha256,receipt.pdfBytes);const bytes=await readFile(path);await this.store.requestContext(check);return bytes;
  });
 }
 private async view(user:InMemoryUserAccount,row:PaperCaptureDerivationRecord,task:TaskRow|null):Promise<PaperCaptureDerivationView>{
  const group=this.store.find('paperCaptureGroups',{id:row.groupId}),current=group?.history.at(-1)?.version,sourceChanged=current?.revision!==row.groupRevision||current?.fingerprint!==row.groupFingerprint;
  let canControl=row.attribution.ownerUserId===user.id&&!row.pdf;try{if(canControl)this.commands.writer(user,row.attribution.scope);}catch{canControl=false;}
  const material=row.materialId?this.store.find('studioSourceMaterials',{id:row.materialId}):null,processing=material?.processingTaskId?await this.store.tasks.get(material.processingTaskId):null;
  return{id:row.id,scope:structuredClone(row.attribution.scope),groupId:row.groupId,groupRevision:row.groupRevision,groupFingerprint:row.groupFingerprint,sourceChanged,createdAt:row.createdAt,ownerClosed:row.attribution.ownerUserId===null,
   status:row.pdf?'pdf_ready':!task?'unavailable':task.state==='running'?'processing':task.state==='cancel_requested'?'cancelling':task.state==='queued'||task.state==='retry_wait'?'queued':task.state,
   pdf:structuredClone(row.pdf),materialId:row.materialId,publishedAt:row.publishedAt,canCancel:canControl&&Boolean(task&&active.includes(task.state)),canRetry:canControl&&!sourceChanged&&Boolean(task&&['failed','cancelled'].includes(task.state)),
   task:task?{id:task.id,state:task.state,version:task.version,generation:task.generation,errorCode:task.errorCode,stage:typeof task.progress.stage==='string'?task.progress.stage:null}:null,
   recognition:material?{materialId:material.id,status:materialTaskStatus(material,processing?.state),pageCount:material.pageCount,processedPages:(material as any).processingPages?.length??material.pages.length,reviewRequired:material.structure?.reviewRequired??true}:null};
 }
 async recognize(user:InMemoryUserAccount,id:string,value:unknown,session:InMemoryAuthSession){
  const input=this.commands.parse(value);if(input.kind!=='recognize'||input.groupId!==id)throw new BadRequestException('请明确确认原采集组页序后再开始识别。');
  return this.commands.transaction(async()=>{
   const group=this.sourceGroup(user,id),scope=this.commands.scope(user,group.attribution.scope.studentId,group.attribution.scope.subject),prior=this.commands.existing(user,scope,input);if(prior){if(prior.status!=='committed')throw new ConflictException('请先核对原识别命令。');return structuredClone(prior.result!);}
   const authorization=this.commands.authorizeSession(user,scope,session),version=group.history.at(-1)!.version;
   if(input.input.expectedRevision!==group.revision||input.input.expectedFingerprint!==version.fingerprint)throw new ConflictException('采集组已改变，请保留完整输入并重新核对页序。');
   if(version.pages.length>PAPER_DERIVED_PDF_LIMITS.pages||version.pages.reduce((sum,page)=>sum+page.width*page.height,0)>PAPER_DERIVED_PDF_LIMITS.pixels)throw new BadRequestException('本组处理图像素超过一次派生预算，请明确拆组后继续。');
   const pageIds=[...new Set(group.history.flatMap(saved=>saved.version.pages.map(page=>page.pageId)))];assertPaperCaptureGroupRecord(group,this.store.select('paperCapturePages',{id:pageIds}));
   const at=new Date().toISOString(),derivationId=this.store.nextId('paper_derivation'),taskId=this.store.nextId('task'),row:PaperCaptureDerivationRecord={protocol:'paper-capture-derivation-record-v1',id:derivationId,attribution:{protocol:'paper-capture-attribution-v1',scope,ownerUserId:user.id,createdAt:at},groupId:id,groupRevision:version.revision,groupFingerprint:version.fingerprint,taskId,createdAt:at,pdf:null,materialId:null,publishedAt:null,publishedGeneration:null};assertPaperCaptureDerivation(row,version);
   const result={kind:'recognize',derivationId,groupId:id,groupRevision:version.revision,groupFingerprint:version.fingerprint,taskId,taskVersion:1,taskGeneration:1,createdAt:at},command=preparePaperCaptureCommand(user.id,scope,input,result,at);command.authorization=authorization;assertPaperCaptureCommand(command);
   this.store.append('paperCaptureDerivations',row);this.store.append('paperCaptureCommands',command);const payload=paperCaptureDerivationPayload(row);await this.store.enqueueTask({id:taskId,kind:paperCaptureDerivationKind,ownerUserId:user.id,requestKey:'paper-derive:'+derivationId,payloadHash:retentionDigest(payload),payload,createdAt:at,maxAttempts:2});return result;
  });
 }
 async control(user:InMemoryUserAccount,id:string,value:unknown,session:InMemoryAuthSession,expectedKind:'cancelDerivation'|'retryDerivation'){
  const input=this.commands.parse(value);if(input.kind!==expectedKind||!['cancelDerivation','retryDerivation'].includes(input.kind)||!('derivationId'in input)||input.derivationId!==id)throw new BadRequestException('请使用原识别任务的完整取消或重试命令。');
  return this.commands.transaction(async()=>{
   const row=this.record(user,id,true);if(row.groupId!==input.groupId)throw new ConflictException('识别命令对应另一份原采集组。');const prior=this.commands.existing(user,row.attribution.scope,input);if(prior){if(prior.status!=='committed')throw new ConflictException('请先核对原任务操作。');return structuredClone(prior.result!);}
   const authorization=this.commands.authorizeSession(user,row.attribution.scope,session),task=await this.store.tasks.get(row.taskId);if(!task||task.kind!==paperCaptureDerivationKind||task.ownerUserId!==user.id)throw new ConflictException('原持久任务关系需要核对。');if(row.pdf||task.state==='succeeded')throw new ConflictException('派生PDF已完成，请从已保存资料查看原识别进度。');
   if(task.version!==input.input.expectedTaskVersion||task.generation!==input.input.expectedGeneration)throw new ConflictException('原任务状态或代次已变化，请读取进度后核对完整输入。');
   const retry=input.kind==='retryDerivation';let version=task.version,generation=task.generation;
   if(retry){const group=this.sourceGroup(user,row.groupId);if(group.revision!==row.groupRevision||group.history.at(-1)!.version.fingerprint!==row.groupFingerprint)throw new ConflictException('采集组已修订，请确认新版后开始新的识别。');if(!['failed','cancelled'].includes(task.state))throw new ConflictException('只有已失败或已取消的任务可以明确重试。');await this.store.controlTask({id:task.id,action:'retry',expectedVersion:task.version,actorId:user.id});version++;generation++;}
   else if(['queued','running','retry_wait'].includes(task.state)){await this.store.controlTask({id:task.id,action:'cancel',expectedVersion:task.version,actorId:user.id});version++;}
   const at=new Date().toISOString(),result={kind:input.kind,derivationId:id,groupId:row.groupId,taskId:task.id,taskVersion:version,taskGeneration:generation,acceptedAt:at},command=preparePaperCaptureCommand(user.id,row.attribution.scope,input,result,at);command.authorization=authorization;assertPaperCaptureCommand(command);this.store.append('paperCaptureCommands',command);return result;
  });
 }
 /** A retry has its own original authorization; the earlier enqueue receipt
  * remains unchanged and cannot silently authorize a newer task generation. */
 activation(row:PaperCaptureDerivationRecord,task:TaskRow):PaperCaptureCommandRecord{
  if(row.attribution.ownerUserId===null)throw new ForbiddenException('原识别作者已关闭，旧任务不能继续发布。');
  const originals=this.store.select('paperCaptureCommands',{actorId:row.attribution.ownerUserId}).filter(command=>command.status==='committed'&&['recognize','retryDerivation'].includes(command.input.kind)&&command.result?.derivationId===row.id&&command.result?.taskGeneration===task.generation);
  if(originals.length!==1)throw new ForbiddenException('这个任务代次没有当前原确认命令，请明确重试。');assertPaperCaptureCommand(originals[0]);return originals[0];
 }
 authorizeWork(row:PaperCaptureDerivationRecord,task:TaskRow){
  const owner=row.attribution.ownerUserId&&this.store.find('users',{id:row.attribution.ownerUserId,status:'active'});if(!owner||task.ownerUserId!==owner.id||task.id!==row.taskId||task.kind!==paperCaptureDerivationKind||retentionDigest(task.payload)!==retentionDigest(paperCaptureDerivationPayload(row)))throw new ForbiddenException('原识别关系或作者权限已变化。');
  const activation=this.activation(row,task);this.commands.authorizeWork(owner,row.attribution.scope,activation.authorization);const group=this.sourceGroup(owner,row.groupId),version=group.history.at(-1)!.version;
  if(group.revision!==row.groupRevision||version.fingerprint!==row.groupFingerprint)throw new ConflictException({code:'paper_capture_group_version_changed',message:'原采集组已改变，旧任务不能发布到新版本。'});assertPaperCaptureDerivation(row,version);return{owner,group,version,activation};
 }
}
