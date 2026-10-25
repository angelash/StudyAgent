import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { basename } from 'node:path';
import { z } from 'zod';
import { projectAssetLimits, projectAssetUploadSchema, type ProjectAssetUpload, type ProjectAssetView, type ProjectFileIntegrity } from '@study-agent/contracts';
import { InMemoryStoreService, type InMemoryUserAccount, type InMemoryAuthSession } from '../../infrastructure/in-memory-store.service';
import { assembleImmutableFile, bytesDigest } from '../../infrastructure/immutable-files';
import { acquireStudioFileLease, withStudioFileLease } from '../../infrastructure/studio-file-coordination';
import { validate } from '../../common/validation';
import { StudentsService } from '../students/students.service';
import { courseProjectRecord, captureProjectFileAuthorization, projectFileAuthority } from './course-project-access';
import type { ProjectAssetRecord, ProjectUploadRecord } from './project-file-record';
import { projectAssetFile, projectChunkFile, projectFileRoot, projectOriginalExtension, verifyProjectFile, writeProjectChunk } from './project-file-storage';
import { projectAssetKind } from './project-file-processing';
import { generationDigest } from './source-course-pipeline';
import type {TaskRow} from '../../infrastructure/task-repository';

const commandSchema=z.object({expectedRevision:z.number().int().min(0),expectedTaskVersion:z.number().int().min(1).optional(),requestKey:z.string().min(8).max(180)}).strict();
export function projectAssetReferenced(store:InMemoryStoreService,id:string){
  return store.inspect('courseProjects').some(row=>Object.values(row.drafts).some(draft=>draft.attachments?.some(item=>item.assetId===id))||row.submissions.some(submission=>submission.artifact.attachments?.some(item=>item.assetId===id)||submission.attachmentManifest?.some(item=>item.assetId===id)));
}
export async function scheduleProjectFileCollection(store:InMemoryStoreService,targetKind:'project-upload'|'project-asset',id:string,ownerUserId:string){
  const collection=targetKind==='project-upload'?'projectAssetUploads':'projectAssets',row=store.find(collection,{id});
  if(row?.cleanupTaskId)return;
  const payload={targetKind,key:id},requestKey='project-collect:'+targetKind+':'+id,prior=await store.tasks.find(ownerUserId,'project.file.collect',requestKey);
  if(prior){if(row)row.cleanupTaskId=prior.id;if(['failed','cancelled'].includes(prior.state))await store.controlTask({id:prior.id,action:'retry',expectedVersion:prior.version,actorId:'system-project-files'});return;}
  const taskId='task_'+generationDigest({ownerUserId,requestKey});
  await store.enqueueTask({id:taskId,kind:'project.file.collect',ownerUserId,requestKey,payloadHash:generationDigest(payload),payload,createdAt:new Date().toISOString(),maxAttempts:5});
  if(row)row.cleanupTaskId=taskId;
}
@Injectable()
export class ProjectFileService {
  constructor(private readonly store:InMemoryStoreService,private readonly students:StudentsService){}
  private uploadView(row:ProjectUploadRecord):ProjectAssetUpload{
    const {ownerUserId:_owner,studentId:_student,requestKey:_key,inputHash:_hash,definitionHash:_definition,authorization:_auth,cleanupTaskId:_task,filesCollectedAt:_collected,...view}=row;return structuredClone(view);
  }
  private upload(user:InMemoryUserAccount,id:string,writing=false){
    const row=this.store.find('projectAssetUploads',{id});if(!row)throw new NotFoundException('文件上传不存在');
    if(row.ownerUserId!==user.id)throw new ForbiddenException('不能操作其他账号的文件上传');
    projectFileAuthority(this.store,this.students,row);
    if(writing&&(row.status!=='uploading'||Date.parse(row.expiresAt)<=Date.now()))throw new ConflictException('上传已结束或过期，请读取状态后重新开始');return row;
  }
  private asset(user:InMemoryUserAccount,id:string,writing=false){
    const row=this.store.find('projectAssets',{id});if(!row)throw new NotFoundException('项目文件不存在');
    courseProjectRecord(this.store,this.students,user,row.projectId,writing);
    if(writing&&row.ownerUserId!==user.id)throw new ForbiddenException('不能修改其他账号的项目文件');
    if(row.ownerUserId!==user.id&&!projectAssetReferenced(this.store,row.id))throw new ForbiddenException('文件尚未加入项目作品');return row;
  }
  async view(row:ProjectAssetRecord,provisional?:Pick<TaskRow,'state'|'version'|'generation'|'errorCode'>):Promise<ProjectAssetView>{
    const task=provisional??await this.store.tasks.get(row.taskId),{ownerUserId:_owner,studentId:_student,uploadId:_upload,definitionFingerprint:_fingerprint,definitionHash:_definition,authorization:_auth,taskId:_task,inputHash:_hash,commands:_commands,cleanupTaskId:_cleanup,filesCollectedAt:_collected,...view}=row;
    const status=row.status==='deleted'||row.status==='deleting'||row.status==='ready'?row.status:task?.state==='cancel_requested'?'cancelling':row.status==='cancelled'||task?.state==='cancelled'?'cancelled':task?.state==='failed'?'failed':row.status;
    return structuredClone({...view,status,task:task?{state:task.state,version:task.version,generation:task.generation,errorCode:task.errorCode}:null});
  }
  start(user:InMemoryUserAccount,input:unknown,session:InMemoryAuthSession){
    const command=validate(projectAssetUploadSchema,input),project=courseProjectRecord(this.store,this.students,user,command.projectId,true);
    if(project.definition.fingerprint!==command.definitionFingerprint||!project.definition.stages.some(stage=>stage.id===command.stageId))throw new ConflictException('项目阶段或版本已变化，请读取已保存作品');
    const name=Buffer.from(basename(command.name.replace(/\\/g,'/')).replace(/[\x00-\x1f\x7f]/g,''),'utf8').toString('utf8');if(!name)throw new BadRequestException('文件名不能为空');
    const hash=generationDigest({...command,name,requestKey:undefined}),prior=this.store.find('projectAssetUploads',{ownerUserId:user.id,requestKey:command.requestKey});
    if(prior){if(prior.inputHash!==hash)throw new ConflictException('上传标识已用于其他文件或项目');return this.uploadView(this.upload(user,prior.id));}
    if(this.store.select('projectAssetUploads',{ownerUserId:user.id,status:'uploading'}).filter(row=>Date.parse(row.expiresAt)>Date.now()).length>=12)throw new BadRequestException('请先完成或取消现有上传');
    const now=new Date(),row:ProjectUploadRecord={id:this.store.nextId('project_upload'),projectId:project.id,stageId:command.stageId,definitionFingerprint:command.definitionFingerprint,definitionHash:generationDigest(project.definition),authorization:captureProjectFileAuthorization(this.store,project,user,session),ownerUserId:user.id,studentId:project.studentId,
      name,size:command.size,mediaType:command.mediaType,sha256:command.sha256,chunkSize:projectAssetLimits.chunkBytes,chunks:[],status:'uploading',revision:0,assetId:null,createdAt:now.toISOString(),expiresAt:new Date(now.getTime()+projectAssetLimits.expiresHours*3600000).toISOString(),completedAt:null,requestKey:command.requestKey,inputHash:hash};
    this.store.append('projectAssetUploads',row);return this.uploadView(row);
  }
  async list(user:InMemoryUserAccount,projectId:string,stageId:string){
    const project=courseProjectRecord(this.store,this.students,user,projectId);if(!project.definition.stages.some(stage=>stage.id===stageId))throw new NotFoundException('项目阶段不存在');
    const uploads=project.ownerUserId===user.id?this.store.select('projectAssetUploads',{projectId,stageId,ownerUserId:user.id}).filter(row=>row.status==='uploading').map(row=>this.uploadView(this.upload(user,row.id))):[];
    const assets=this.store.select('projectAssets',{projectId,stageId}).filter(row=>row.status!=='deleted'&&(row.ownerUserId===user.id||projectAssetReferenced(this.store,row.id)));
    return {uploads,assets:await Promise.all(assets.map(row=>this.view(this.asset(user,row.id))))};
  }
  getUpload(user:InMemoryUserAccount,id:string){return this.uploadView(this.upload(user,id));}
  async getAsset(user:InMemoryUserAccount,id:string){return this.view(this.asset(user,id));}
  async integrity(user:InMemoryUserAccount,id:string):Promise<ProjectFileIntegrity>{
    this.asset(user,id);return withStudioFileLease(projectFileRoot(),'project-asset',id,async()=>{
      const row=this.asset(user,id);if(['deleting','deleted','cancelled'].includes(row.status))throw new ConflictException('文件正在结束或回收，不能作为完整文件检查');
      const files:ProjectFileIntegrity['files']=[];for(const file of [row.original,...(row.display?[row.display]:[]),...row.previews.map(preview=>preview.file)]){let status:'verified'|'unavailable'='verified';try{await verifyProjectFile(id,file);}catch{status='unavailable';}files.push({name:file.name,sha256:file.sha256,size:file.size,status});}
      return{assetId:id,checkedAt:new Date().toISOString(),complete:files.every(file=>file.status==='verified'),files};
    });
  }
  async chunk(user:InMemoryUserAccount,id:string,index:number,body:unknown){
    const row=this.upload(user,id,true);
    if(!Number.isSafeInteger(index)||index<0||index>=Math.ceil(row.size/row.chunkSize)||!Buffer.isBuffer(body)||body.length!==Math.min(row.chunkSize,row.size-index*row.chunkSize))throw new BadRequestException('分块序号或大小不匹配，请重新选择同一文件');
    const hash=bytesDigest(body),prior=row.chunks.find(chunk=>chunk.index===index);if(prior){if(prior.sha256!==hash)throw new ConflictException('已上传分块不能替换为其他内容');return this.uploadView(row);}
    const chunk=await writeProjectChunk(row.id,index,body);projectFileAuthority(this.store,this.students,row);row.chunks.push(chunk);row.chunks.sort((a,b)=>a.index-b.index);row.revision++;return this.uploadView(row);
  }
  async complete(user:InMemoryUserAccount,id:string){
    const row=this.upload(user,id);if(row.status==='completed'&&row.assetId)return{upload:this.uploadView(row),asset:await this.view(this.asset(user,row.assetId))};
    this.upload(user,id,true);if(row.chunks.length!==Math.ceil(row.size/row.chunkSize))throw new BadRequestException('还有文件分块未上传');
    const assetId='project_asset_'+row.id.slice('project_upload_'.length),name='original.'+projectOriginalExtension(row.mediaType);
    await withStudioFileLease(projectFileRoot(),'project-upload',id,()=>withStudioFileLease(projectFileRoot(),'project-asset',assetId,()=>assembleImmutableFile({size:row.size,sha256:row.sha256,target:projectAssetFile(assetId,name),chunks:row.chunks.map(chunk=>({...chunk,path:projectChunkFile(id,chunk.index,chunk.sha256)})),validHeader:()=>true})));
    projectFileAuthority(this.store,this.students,row);
    const now=new Date().toISOString(),taskId=this.store.nextId('task'),payload={assetId};
    const asset:ProjectAssetRecord={id:assetId,projectId:row.projectId,stageId:row.stageId,definitionFingerprint:row.definitionFingerprint,definitionHash:row.definitionHash,authorization:structuredClone(row.authorization),ownerUserId:row.ownerUserId,studentId:row.studentId,uploadId:row.id,inputHash:row.inputHash,
      taskId,commands:[],name:row.name,kind:projectAssetKind(row.mediaType),mediaType:row.mediaType,revision:0,status:'queued',original:{name,sha256:row.sha256,size:row.size,mediaType:row.mediaType},previews:[],pageCount:null,durationMs:null,width:null,height:null,normalizationVersion:null,createdAt:now,updatedAt:now};
    this.store.append('projectAssets',asset);await this.store.enqueueTask({id:taskId,kind:'project.asset.process',ownerUserId:user.id,requestKey:'project-process:'+id,payloadHash:generationDigest(payload),payload,createdAt:now,maxAttempts:2});
    row.status='completed';row.assetId=assetId;row.completedAt=now;row.revision++;await scheduleProjectFileCollection(this.store,'project-upload',row.id,user.id);
    return{upload:this.uploadView(row),asset:await this.view(asset,{state:'queued',version:1,generation:1,errorCode:null})};
  }
  async cancelUpload(user:InMemoryUserAccount,id:string,input:unknown){
    const row=this.upload(user,id),command=validate(z.object({expectedRevision:z.number().int().min(0)}).strict(),input);if(row.status==='cancelled'||row.status==='expired')return this.uploadView(row);
    if(row.status!=='uploading'||row.revision!==command.expectedRevision)throw new ConflictException('上传已变化，请读取当前状态');row.status='cancelled';row.revision++;await scheduleProjectFileCollection(this.store,'project-upload',id,user.id);return this.uploadView(row);
  }
  async command(user:InMemoryUserAccount,id:string,action:'cancel'|'retry'|'delete',input:unknown){
    const row=this.asset(user,id,true),command=validate(commandSchema,input),hash=generationDigest({action,...command,requestKey:undefined}),prior=row.commands.find(item=>item.key===command.requestKey);
    if(prior){if(prior.hash!==hash||prior.kind!==action)throw new ConflictException('请求标识已用于其他操作');return this.view(row);}
    if(row.revision!==command.expectedRevision)throw new ConflictException('文件状态已变化，请读取当前状态');
    const task=await this.store.tasks.get(row.taskId);if(!task)throw new ConflictException('文件处理任务不可用');let provisional:Pick<TaskRow,'state'|'version'|'generation'|'errorCode'>|undefined;
    if(action==='retry'){
      if(task.state!=='failed'||row.status==='deleted'||row.status==='deleting'||row.status==='cancelled')throw new ConflictException('只有处理失败的保留原件可以重试');projectFileAuthority(this.store,this.students,row);await verifyProjectFile(row.id,row.original);
      if(command.expectedTaskVersion!==task.version)throw new ConflictException('任务状态已变化，请读取当前状态');await this.store.controlTask({id:task.id,action:'retry',expectedVersion:task.version,actorId:user.id});row.status='queued';provisional={state:'queued',version:task.version+1,generation:task.generation+1,errorCode:null};
    }else{
      if(projectAssetReferenced(this.store,row.id))throw new ConflictException('该文件仍被草稿或历史提交引用，请保留当时作品');
      if(['queued','running','retry_wait','cancel_requested'].includes(task.state)){
        if(command.expectedTaskVersion!==task.version)throw new ConflictException('任务状态已变化，请读取当前状态');await this.store.controlTask({id:task.id,action:'cancel',expectedVersion:task.version,actorId:user.id});provisional={state:['running','cancel_requested'].includes(task.state)?'cancel_requested':'cancelled',version:task.version+1,generation:task.generation,errorCode:null};
      }
      row.status=action==='delete'?(row.filesCollectedAt?'deleted':'deleting'):'cancelled';await scheduleProjectFileCollection(this.store,'project-asset',id,user.id);
    }
    row.revision++;row.updatedAt=new Date().toISOString();row.commands.push({key:command.requestKey,hash,kind:action});return this.view(row,provisional);
  }
  async file(user:InMemoryUserAccount,id:string,variant:string){
    this.asset(user,id);const release=await acquireStudioFileLease(projectFileRoot(),'project-asset',id);
    try{
      const row=this.asset(user,id);if(row.status!=='ready'||(await this.store.tasks.get(row.taskId))?.state!=='succeeded'||!row.normalizationVersion)throw new NotFoundException('文件尚未就绪');
      const file=variant==='original'?row.original:variant==='display'?row.display:row.previews.find(preview=>'page-'+preview.page===variant)?.file;if(!file)throw new NotFoundException('预览文件不存在');
      const path=await verifyProjectFile(id,file);return{path,mediaType:file.mediaType,size:file.size,sha256:file.sha256,release,disposition:variant==='original'?'attachment; filename="download"; filename*=UTF-8\'\''+encodeURIComponent(row.name).replace(/'/g,'%27'):'inline'};
    }catch(error){await release();throw error;}
  }
}
