import {ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {z} from 'zod';
import {paperCaptureCommandLookupSchema,type PaperCaptureCommandLookup} from '@study-agent/contracts';
import {InMemoryStoreService,type InMemoryUserAccount,type InMemoryAuthSession} from '../../infrastructure/in-memory-store.service';
import type {TaskFence} from '../../infrastructure/task-repository';
import {DomainWriteConflict} from '../../infrastructure/domain-write-conflict';
import {validate} from '../../common/validation';
import {StudentsService} from '../students/students.service';
import {retentionDigest} from '../diagnostics/retention-anchor';
import {paperCaptureSourceScope,type PaperCaptureScope} from './paper-capture-scope';
import {paperCapturePendingCommandSchema,type PaperCapturePendingCommand} from './paper-capture-command';
import {paperCaptureCommandId,paperCaptureCommandHash,pendingPaperCaptureCommand,assertPaperCaptureCommand,type PaperCaptureCommandRecord} from './paper-capture-record';

@Injectable()
export class PaperCaptureCommandService{
 constructor(private readonly store:InMemoryStoreService,private readonly students:StudentsService){}
 audience(user:InMemoryUserAccount,scope:PaperCaptureScope){
  const actual=this.store.find('users',{id:user.id,status:'active'});if(!actual||actual.role!==user.role)throw new ForbiddenException('登录身份已变化，请保留原输入后重新确认。');
  if(scope.studentId){if(!this.store.find('students',{id:scope.studentId}))throw new NotFoundException('原学习档案不存在。');this.students.assertCanAccessStudent(actual,scope.studentId);}
  else if(user.role==='student'||scope.creatorFingerprint!==retentionDigest({id:user.id}))throw new ForbiddenException('这份私人资料只属于原账号。');
  return actual;
 }
 own(user:InMemoryUserAccount,scope:PaperCaptureScope){const actual=this.audience(user,scope);if(scope.creatorFingerprint!==retentionDigest({id:actual.id}))throw new ForbiddenException('请在原作者账号中继续这份采集。');return actual;}
 writer(user:InMemoryUserAccount,scope:PaperCaptureScope){const actual=this.own(user,scope);if(actual.role==='student'&&(!scope.studentId||!this.store.find('subjectEnrollments',{studentId:scope.studentId,subject:scope.subject,enabled:true})))throw new ForbiddenException('请先由家长开启这份资料对应的学习学科。');return actual;}
 authorizeSession(user:InMemoryUserAccount,scope:PaperCaptureScope,session:InMemoryAuthSession){
  const actual=this.writer(user,scope),login=this.store.find('sessions',{id:session.id,userId:actual.id,revokedAt:null});if(!login||Date.parse(login.expiresAt)<=Date.now()||login.guardianId!==session.guardianId||login.accessVersion!==session.accessVersion)throw new ForbiddenException('原操作的登录授权已变化，请保留完整输入后重新确认。');
  const authorization:NonNullable<PaperCaptureCommandRecord['authorization']>={actorRole:actual.role,actorVersion:actual.version??0};
  if(actual.role==='student'){const guardian=this.store.find('users',{id:login.guardianId,status:'active',role:['parent','admin']});if(!guardian||!this.store.find('studentLearningAccess',{studentId:scope.studentId,userId:actual.id,status:'enabled',version:login.accessVersion})||guardian.role!=='admin'&&!this.store.find('bindings',{studentId:scope.studentId,parentUserId:guardian.id,status:'active'}))throw new ForbiddenException('原操作的学习授权已变化，请重新确认。');authorization.learningAccess={guardianId:guardian.id,accessVersion:login.accessVersion!};}
  return authorization;
 }
 authorizeWork(user:InMemoryUserAccount,scope:PaperCaptureScope,authorization:PaperCaptureCommandRecord['authorization']){
  const actual=this.writer(user,scope);if(!authorization||authorization.actorRole!==actual.role||authorization.actorVersion!==(actual.version??0)||authorization.guardianDeletionHash)throw new ForbiddenException('原任务的账号授权已变化，请用当前身份明确重试。');
  if(actual.role==='student'){const access=authorization.learningAccess,guardian=access&&this.store.find('users',{id:access.guardianId,status:'active',role:['parent','admin']});if(!access||!guardian||!this.store.find('studentLearningAccess',{studentId:scope.studentId,userId:actual.id,status:'enabled',version:access.accessVersion})||guardian.role!=='admin'&&!this.store.find('bindings',{studentId:scope.studentId,parentUserId:guardian.id,status:'active'}))throw new ForbiddenException('原任务的学习授权已变化，请用当前授权明确重试。');}return actual;
 }
 scope(user:InMemoryUserAccount,studentId:string|null,subject:PaperCaptureScope['subject']){const scope=paperCaptureSourceScope({actorId:user.id,studentId,subject});this.own(user,scope);return scope;}
 parse(value:unknown){const input=validate(paperCapturePendingCommandSchema,value);if(retentionDigest(input)!==retentionDigest(value))throw new ConflictException('请保留并使用完整原命令。');return input;}
 existing(user:InMemoryUserAccount,scope:PaperCaptureScope,input:PaperCapturePendingCommand){
  this.own(user,scope);const row=this.store.find('paperCaptureCommands',{id:paperCaptureCommandId(user.id,input.requestKey)});if(!row)return;
  assertPaperCaptureCommand(row);if(row.actorId!==user.id||row.requestHash!==paperCaptureCommandHash(user.id,scope,input)||retentionDigest(row.input)!==retentionDigest(input))throw new ConflictException('原请求键已用于另一份完整命令，请保留输入并核对原结果。');return row;
 }
 result(user:InMemoryUserAccount,requestKey:string):PaperCaptureCommandLookup{
  validate(z.string().min(8).max(180),requestKey);const row=this.store.find('paperCaptureCommands',{id:paperCaptureCommandId(user.id,requestKey)});if(!row)return{state:'unknown' as const,requestKey};this.own(user,row.scope);assertPaperCaptureCommand(row);
  return paperCaptureCommandLookupSchema.parse({state:row.status,requestKey,input:structuredClone(row.input),scope:structuredClone(row.scope),result:structuredClone(row.result),errorCode:row.errorCode,generation:row.generation});
 }
 begin(user:InMemoryUserAccount,scope:PaperCaptureScope,input:PaperCapturePendingCommand){
  this.writer(user,scope);const prior=this.existing(user,scope,input),at=new Date().toISOString();if(prior?.status==='committed')return prior;
  if(prior){if(prior.status==='rejected'){prior.status='preparing';prior.generation++;prior.at=at;prior.errorCode=null;prior.fileIds=[];}return prior;}
  const row=pendingPaperCaptureCommand(user.id,scope,input,at);this.store.append('paperCaptureCommands',row);return row;
 }
 finish(user:InMemoryUserAccount,scope:PaperCaptureScope,input:PaperCapturePendingCommand,generation:number,result:Record<string,unknown>,at:string){
  this.writer(user,scope);const row=this.existing(user,scope,input);if(!row)throw new ConflictException('原操作已被撤回，请保留输入后核对。');if(row.status==='committed')return row.result!;
  if(row.status!=='preparing'||row.generation!==generation)throw new ConflictException('原操作代次已变化，请先读取原命令结果。');
  row.status='committed';row.at=at;row.result=structuredClone(result);row.resultHash=retentionDigest(result);row.errorCode=null;assertPaperCaptureCommand(row);return structuredClone(result);
 }
 async reject(actorId:string,input:PaperCapturePendingCommand,generation:number,errorCode:string){
  await this.transaction(()=>{const row=this.store.find('paperCaptureCommands',{id:paperCaptureCommandId(actorId,input.requestKey)});if(!row||row.status!=='preparing'||row.generation!==generation||retentionDigest(row.input)!==retentionDigest(input))return;row.status='rejected';row.errorCode=errorCode;row.at=new Date().toISOString();assertPaperCaptureCommand(row);});
 }
 async transaction<T>(body:()=>T|Promise<T>,fence?:TaskFence):Promise<T>{
  for(let attempt=0;attempt<3;attempt++)try{return await this.store.transaction(body,fence);}catch(error){if(error instanceof DomainWriteConflict&&attempt<2)continue;throw error;}
  throw new ConflictException('采集发生并发变化，请保留原命令后核对。');
 }
}
