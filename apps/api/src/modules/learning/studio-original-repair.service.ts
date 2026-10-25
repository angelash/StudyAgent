import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {StudioOriginalRepair} from '@study-agent/contracts';
import {validate} from '../../common/validation';
import {InMemoryStoreService,type InMemoryUserAccount,type InMemoryAuthSession} from '../../infrastructure/in-memory-store.service';
import {observeStudioOriginal} from '../../infrastructure/studio-original-repair';
import {withStudioFileLease} from '../../infrastructure/studio-file-coordination';
import {StudentsService} from '../students/students.service';
import {assertMaterialAccess,type StudioMaterialRecord} from './studio-material-access';
import {assertStudioAssetAvailable,studioMaterialRoot,type StudioMaterialAssetRecord} from './studio-material-storage';
import {StudioMaterialUploadService} from './studio-material-upload.service';
import {sourceDigest} from './source-course-content';
import {materialVersion} from './source-course-selection';
import type {StudioOriginalRepairRecord} from './studio-original-repair-record';

const key=z.string().min(8).max(180),id=z.string().min(1).max(180),version=z.string().regex(/^[a-f0-9]{64}$/);
export const originalRepairKind='studio.material.repair',originalCleanupKind='studio.material.repair.cleanup';
export class RepairAuthorityChanged extends Error{constructor(){super('original_repair_authority_changed');}}

/** Also called in every worker checkpoint transaction, never from an old HTTP snapshot. */
export function assertOriginalRepairAuthority(store:InMemoryStoreService,students:StudentsService,row:StudioOriginalRepairRecord){
 const owner=store.find('users',{id:row.ownerUserId,status:'active',role:row.authorization.role});
 const material=store.find('studioSourceMaterials',{id:row.materialId}) as StudioMaterialRecord|undefined;
 if(!owner||!material||material.studentId!==row.studentId||material.subject!==row.subject||(material.ownerUserId??null)!==row.materialOwnerUserId||material.sha256!==row.identity.sha256||material.byteSize!==row.identity.size||materialVersion(material)!==row.materialVersion)throw new RepairAuthorityChanged();
 try{assertMaterialAccess(owner,material,students);}catch{throw new RepairAuthorityChanged();}
 const auth=row.authorization;
 if(auth.bindingId&&!store.find('bindings',{id:auth.bindingId,status:'active',studentId:row.studentId,parentUserId:auth.guardianId??owner.id}))throw new RepairAuthorityChanged();
 if(owner.role==='student'){
  const guardian=store.find('users',{id:auth.guardianId,status:'active'});
  if(!guardian||!['parent','admin'].includes(guardian.role)||!store.find('studentLearningAccess',{id:auth.accessId,studentId:row.studentId,userId:owner.id,status:'enabled',version:auth.accessVersion}))throw new RepairAuthorityChanged();
 }
 return material;
}
export function assertOriginalRepairAsset(asset:StudioMaterialAssetRecord|undefined,row:StudioOriginalRepairRecord){
 const expected=row.identity,current=asset?.repair?.identity;
 const baseline=(value:typeof row.baseline|undefined)=>!value?null:value.kind==='missing'?['missing']:[value.kind,value.sha256,value.size,value.dev,value.ino,value.mtimeMs,value.pdf];
 if(!asset||asset.state!=='repairing'||asset.generation!==expected.generation||!current||current.id!==expected.id||current.taskId!==expected.taskId||current.sha256!==expected.sha256||current.size!==expected.size||current.generation!==expected.generation||current.token!==expected.token||current.bindingHash!==expected.bindingHash||asset.repair!.uploadId!==row.uploadId||sourceDigest(baseline(asset.repair!.baseline))!==sourceDigest(baseline(row.baseline))||asset.repair!.cleanupRequested)throw new RepairAuthorityChanged();
}

@Injectable()
export class StudioOriginalRepairService{
 constructor(private readonly store:InMemoryStoreService,private readonly students:StudentsService,private readonly uploads:StudioMaterialUploadService){}
 private material(user:InMemoryUserAccount,id:string){const row=this.store.find('studioSourceMaterials',{id}) as StudioMaterialRecord|undefined;if(!row)throw new NotFoundException('来源资料不存在');assertMaterialAccess(user,row,this.students);return row;}
 private record(user:InMemoryUserAccount,materialId:string,repairId:string,write=false){this.material(user,materialId);const row=this.store.find('studioOriginalRepairs',{id:repairId,materialId});if(!row)throw new NotFoundException('原件恢复记录不存在');if(write&&row.ownerUserId!==user.id)throw new ForbiddenException('请由发起恢复的账号操作');return row;}
 private async view(row:StudioOriginalRepairRecord,user:InMemoryUserAccount):Promise<StudioOriginalRepair>{
  const task=await this.store.tasks.get(row.status==='cleaning'?(this.store.find('studioMaterialAssets',{id:row.identity.sha256})?.repair?.cleanupTaskId??row.taskId):row.taskId);
  return{id:row.id,materialId:row.materialId,uploadId:row.uploadId,status:row.status,canManage:row.ownerUserId===user.id,revision:row.revision,createdAt:row.createdAt,updatedAt:row.updatedAt,completedAt:row.completedAt,receipt:structuredClone(row.receipt),task:task?{id:task.id,state:task.state,version:task.version,errorCode:task.errorCode}:null};
 }
 async list(user:InMemoryUserAccount,materialId:string){this.material(user,materialId);return Promise.all(this.store.select('studioOriginalRepairs',{materialId}).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,30).map(row=>this.view(row,user)));}
 async get(user:InMemoryUserAccount,materialId:string,repairId:string){return this.view(this.record(user,materialId,repairId),user);}
 async start(user:InMemoryUserAccount,materialId:string,input:unknown,session:InMemoryAuthSession){
  if(!['parent','admin','student'].includes(user.role))throw new ForbiddenException('请使用监护人或当前孩子的学习身份恢复资料');
  const command=validate(z.object({version,uploadId:id,requestKey:key}).strict(),input),hash=sourceDigest([materialId,command.version,command.uploadId]);
  const material=this.material(user,materialId),previous=this.store.select('studioOriginalRepairs',{ownerUserId:user.id}).find(row=>row.requests.some(r=>r.key===command.requestKey));
  if(previous){const request=previous.requests.find(r=>r.key===command.requestKey)!;if(request.kind!=='start'||request.hash!==hash)throw new ConflictException('恢复标识已用于其他文件或资料版本');return this.view(this.record(user,materialId,previous.id),user);}
  if(material.kind==='text'||material.originalFormat||!Number.isSafeInteger(material.byteSize)||material.byteSize<5||material.byteSize>50*1024*1024)throw new BadRequestException('当前入口只恢复有明确校验信息的PDF原件');
  if(materialVersion(material)!==command.version)throw new ConflictException('资料版本已变化，请重新核对');
  const upload=this.uploads.forRepair(user,command.uploadId);
  if(upload.sha256!==material.sha256||upload.size!==material.byteSize||upload.studentId!==material.studentId||upload.subject!==material.subject)throw new BadRequestException('请选择与这份资料完全相同的原始PDF，文件名相同不代表内容相同');
  if(upload.chunks.length!==Math.ceil(upload.size/upload.chunkSize)||upload.chunks.some((c,index)=>c.index!==index||c.size!==Math.min(upload.chunkSize,upload.size-index*upload.chunkSize)))throw new BadRequestException('请先完成同一原件的全部分块上传');
  if((await this.store.tasks.activeStudioSourceTasks(material.sha256)).length)throw new ConflictException('请等待当前资料处理真正停止，再恢复原件');
  const asset=assertStudioAssetAvailable(this.store,material.sha256),observedGeneration=asset.generation;
  return withStudioFileLease(studioMaterialRoot(),'source',material.sha256,async()=>{
   const current=await this.store.requestContext(()=>this.store.find('studioMaterialAssets',{id:material.sha256}));
   if(!current||current.state!=='available'||current.generation!==observedGeneration)throw new ConflictException('原件状态已变化，请重新读取');
   const baseline=await observeStudioOriginal(studioMaterialRoot(),material.sha256);
   const authorization:StudioOriginalRepairRecord['authorization']={role:user.role};
   if(material.studentId){
    if(user.role==='parent'){const binding=this.store.find('bindings',{parentUserId:user.id,studentId:material.studentId,status:'active'});if(!binding)throw new ForbiddenException();authorization.bindingId=binding.id;}
    if(user.role==='student'){
     const guardian=this.store.find('users',{id:session.guardianId,status:'active'}),access=this.store.find('studentLearningAccess',{studentId:material.studentId,userId:user.id,status:'enabled',version:session.accessVersion});
     if(!guardian||!access)throw new ForbiddenException('原学习授权已变化');
     Object.assign(authorization,{guardianId:guardian.id,accessVersion:access.version,accessId:access.id});
     if(guardian.role!=='admin'){const binding=this.store.find('bindings',{parentUserId:guardian.id,studentId:material.studentId,status:'active'});if(!binding)throw new ForbiddenException();authorization.bindingId=binding.id;}
    }
   }
   const now=new Date().toISOString(),repairId=this.store.nextId('studio_repair'),taskId=this.store.nextId('task'),cleanupTaskId=this.store.nextId('task');
   const identity={id:repairId,sha256:material.sha256,size:material.byteSize,generation:asset.generation+1,taskId,token:randomUUID(),bindingHash:sourceDigest([material.id,command.version,upload.id,upload.revision,user.id,authorization,baseline])};
   const row:StudioOriginalRepairRecord={id:repairId,ownerUserId:user.id,studentId:material.studentId,subject:material.subject,materialOwnerUserId:material.ownerUserId??null,materialId:material.id,materialVersion:command.version,uploadId:upload.id,uploadRevision:upload.revision,taskId,identity,baseline,authorization,status:'queued',revision:0,createdAt:now,updatedAt:now,completedAt:null,receipt:null,requests:[{key:command.requestKey,kind:'start',hash}]};
   assertOriginalRepairAuthority(this.store,this.students,row);
   asset.state='repairing';asset.generation=identity.generation;asset.updatedAt=now;asset.repair={identity,baseline,uploadId:upload.id,cleanupTaskId,cleanupRequested:false};
   upload.repairId=repairId;this.store.append('studioOriginalRepairs',row);
   await this.store.enqueueTask({id:taskId,kind:originalRepairKind,ownerUserId:user.id,requestKey:'original-repair:'+repairId,payloadHash:sourceDigest([repairId,material.sha256]),payload:{repairId,sha256:material.sha256},createdAt:now,maxAttempts:5});
   return this.view(row,user);
  });
 }
 async control(user:InMemoryUserAccount,materialId:string,repairId:string,action:'cancel'|'retry',input:unknown){
  const row=this.record(user,materialId,repairId,true),command=validate(z.object({expectedRevision:z.number().int().min(0),requestKey:key}).strict(),input),hash=sourceDigest([action,command.expectedRevision]),previous=row.requests.find(r=>r.key===command.requestKey);
  if(previous){if(previous.kind!==action||previous.hash!==hash)throw new ConflictException('请求标识已使用');return this.view(row,user);}
  if(row.revision!==command.expectedRevision)throw new ConflictException('恢复进度已更新，请读取已保存状态');
  if(['completed','cancelled','cleaning'].includes(row.status))throw new ConflictException('这次恢复已结束或正在收尾');
  const asset=this.store.find('studioMaterialAssets',{id:row.identity.sha256});assertOriginalRepairAsset(asset,row);
  const task=await this.store.tasks.get(row.taskId);if(!task)throw new ConflictException('恢复任务需要检查');
  if(action==='retry'){
   assertOriginalRepairAuthority(this.store,this.students,row);
   if(!['failed','cancelled'].includes(task.state))throw new ConflictException('当前任务仍在等待或运行，请读取进度');
   await this.store.controlTask({id:task.id,action:'retry',expectedVersion:task.version,actorId:user.id});row.status='queued';
  }else{
   asset!.repair!.cleanupRequested=true;row.status='cleaning';
   if(['queued','running','retry_wait','cancel_requested'].includes(task.state))await this.store.controlTask({id:task.id,action:'cancel',expectedVersion:task.version,actorId:user.id});
   await this.scheduleCleanup(asset!);
  }
  row.requests.push({key:command.requestKey,kind:action,hash});row.revision++;row.updatedAt=new Date().toISOString();return this.view(row,user);
 }
 async scheduleCleanup(asset:StudioMaterialAssetRecord){
  const repair=asset.repair;if(asset.state!=='repairing'||!repair)return;
  const task=await this.store.tasks.get(repair.cleanupTaskId);
  if(task){if(['failed','cancelled'].includes(task.state))await this.store.controlTask({id:task.id,action:'retry',expectedVersion:task.version,actorId:'system-material-repair'});return;}
  await this.store.enqueueTask({id:repair.cleanupTaskId,kind:originalCleanupKind,ownerUserId:'system-material-repair',requestKey:'original-cleanup:'+repair.identity.id,payloadHash:sourceDigest([asset.id,repair.identity.id]),payload:{sha256:asset.id,repairId:repair.identity.id},createdAt:new Date().toISOString(),maxAttempts:5});
 }
}
