import { BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException } from '@nestjs/common';
import { basename,resolve } from 'node:path';
import { z } from 'zod';
import { studioMaterialLimits } from '@study-agent/contracts';
import type { StudioMaterialUpload,StudioMaterialProgress } from '@study-agent/contracts';
import { InMemoryStoreService,type InMemoryUserAccount,type InMemoryAuthSession } from '../../infrastructure/in-memory-store.service';
import { assembleImmutableFile,bytesDigest,writeImmutableBytes } from '../../infrastructure/immutable-files';
import { validate } from '../../common/validation';
import { StudentsService } from '../students/students.service';
import { assertMaterialAccess,studioMaterialView,materialTaskStatus,type StudioMaterialRecord } from './studio-material-access';
import { assertStudioAssetAvailable,withStudioSourceFileWrite,studioMaterialFile,studioMaterialRoot } from './studio-material-storage';
import { withStudioFileLease } from '../../infrastructure/studio-file-coordination';
import { materialVersion } from './source-course-selection';
import { sourceDigest } from './source-course-content';
import { StudioMaterialMaintenanceService } from './studio-material-maintenance.service';

const id=z.string().min(1).max(180),key=z.string().min(8).max(180),scope={studentId:id.optional(),subject:z.enum(['math','chinese','english']).optional()};
export type StudioMaterialUploadRecord=StudioMaterialUpload&{requestKey:string;requestHash:string;aliases?:Array<{key:string;hash:string}>;guardianId?:string;accessVersion?:number;filesCollectedAt?:string};
@Injectable()
export class StudioMaterialUploadService {
  constructor(private readonly store:InMemoryStoreService,private readonly students:StudentsService,private readonly maintenance:StudioMaterialMaintenanceService){}
  private scope(user:InMemoryUserAccount,studentId?:string|null,subject?:string|null){
    if(Boolean(studentId)!==Boolean(subject))throw new BadRequestException('档案和学科需要同时选择');
    if(studentId){this.students.assertCanAccessStudent(user,studentId);if(!this.store.find('students',{id:studentId}))throw new NotFoundException('学习档案不存在');}
    else if(user.role==='student')throw new ForbiddenException('请从自己的学习档案上传资料');
  }
  private view(row:StudioMaterialUploadRecord):StudioMaterialUpload {const{requestKey:_key,requestHash:_hash,aliases:_aliases,guardianId:_guardian,accessVersion:_version,filesCollectedAt:_collected,...view}=row;return structuredClone(view);}
  private record(user:InMemoryUserAccount,id:string,write=false){
    const row=this.store.find('studioMaterialUploads',{id});if(!row)throw new NotFoundException('上传记录不存在');
    if(row.ownerUserId!==user.id)throw new ForbiddenException('不能操作其他账号的上传');this.scope(user,row.studentId,row.subject);
    if(user.role==='student'){
      const access=this.store.find('studentLearningAccess',{studentId:row.studentId,userId:user.id,status:'enabled',version:row.accessVersion}),guardian=this.store.find('users',{id:row.guardianId,status:'active'});
      if(!access||!guardian||guardian.role!=='admin'&&!this.store.find('bindings',{studentId:row.studentId,parentUserId:guardian.id,status:'active'}))throw new ForbiddenException('原上传的学习授权已变更，请重新开始');
    }
    if(write&&row.status==='uploading'&&Date.parse(row.expiresAt)<=Date.now())throw new ConflictException('上传已过期，请保留原文件并重新开始');return row;
  }
  list(user:InMemoryUserAccount,input:unknown){const command=validate(z.object(scope).strict(),input);this.scope(user,command.studentId,command.subject);return this.store.select('studioMaterialUploads',{ownerUserId:user.id,studentId:command.studentId??null,subject:command.subject??null}).filter(row=>row.status==='uploading').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(row=>this.view(this.record(user,row.id)));}
  start(user:InMemoryUserAccount,input:unknown,session:InMemoryAuthSession){
    const command=validate(z.object({...scope,name:z.string().trim().min(1).max(255),size:z.number().int().min(5).max(studioMaterialLimits.bytes),sha256:z.string().regex(/^[a-f0-9]{64}$/),requestKey:key}).strict(),input);this.scope(user,command.studentId,command.subject);
    const name=basename(command.name.replace(/\\/g,'/')).replace(/[\x00-\x1f\x7f]/g,'');if(!/\.pdf$/iu.test(name))throw new BadRequestException('请选择PDF文件');
    const hash=sourceDigest({...command,requestKey:undefined,name}),owned=this.store.select('studioMaterialUploads',{ownerUserId:user.id}),prior=owned.find(row=>row.requestKey===command.requestKey||row.aliases?.some(alias=>alias.key===command.requestKey));
    if(prior){if((prior.requestKey===command.requestKey?prior.requestHash:prior.aliases?.find(alias=>alias.key===command.requestKey)?.hash)!==hash)throw new ConflictException('上传标识已用于不同文件或学习范围');return this.view(this.record(user,prior.id));}
    const existing=owned.find(row=>row.status==='uploading'&&row.requestHash===hash&&Date.parse(row.expiresAt)>Date.now());if(existing){this.record(user,existing.id,true);if((existing.aliases?.length??0)>=1000)throw new ConflictException('相同文件已有上传，请读取该记录继续');existing.aliases=[...(existing.aliases??[]),{key:command.requestKey,hash}];return this.view(existing);}
    if(this.store.select('studioMaterialUploads',{ownerUserId:user.id,status:'uploading'}).filter(row=>Date.parse(row.expiresAt)>Date.now()).length>=12)throw new BadRequestException('请先完成或取消现有上传');
    const now=new Date(),row:StudioMaterialUploadRecord={id:this.store.nextId('studio_upload'),ownerUserId:user.id,studentId:command.studentId??null,subject:command.subject??null,name,size:command.size,sha256:command.sha256,chunkSize:studioMaterialLimits.chunkBytes,chunks:[],status:'uploading',revision:0,createdAt:now.toISOString(),expiresAt:new Date(now.getTime()+studioMaterialLimits.expiresHours*3600000).toISOString(),completedAt:null,materialId:null,requestKey:command.requestKey,requestHash:hash,...(user.role==='student'?{guardianId:session.guardianId!,accessVersion:session.accessVersion!}:{})};
    assertStudioAssetAvailable(this.store,row.sha256);this.store.append('studioMaterialUploads',row);return this.view(row);
  }
  get(user:InMemoryUserAccount,id:string){return this.view(this.record(user,id));}
  async material(user:InMemoryUserAccount,id:string){const row=this.store.find('studioSourceMaterials',{id});if(!row)throw new NotFoundException('来源资料不存在');assertMaterialAccess(user,row,this.students);const material=studioMaterialView(row,true);if(row.processingTaskId)material.status=materialTaskStatus(row,(await this.store.tasks.get(row.processingTaskId))?.state);return{material,version:materialVersion(row)};}
  page(user:InMemoryUserAccount,id:string,page:number,input:unknown){
    const command=validate(z.object({version:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),input),row=this.store.find('studioSourceMaterials',{id});if(!row)throw new NotFoundException('来源资料不存在');assertMaterialAccess(user,row,this.students);
    if(materialVersion(row)!==command.version)throw new ConflictException('资料版本已变化，请重新核对当前原页');
    const original=row.pages.find(value=>value.page===page);if(!original)throw new NotFoundException('这一页还没有已保存的正文');
    return{key:'preview',materialId:row.id,page,title:row.title,kind:row.kind??'pdf',text:original.text,blocks:structuredClone(original.blocks??[]),sha256:row.sha256,version:command.version,fingerprint:sourceDigest(original),structureReviewRequired:row.structure?.reviewRequired??false};
  }
  private chunkPath(id:string,index:number,sha256:string){if(!/^studio_upload_[a-f0-9-]+$/.test(id)||!Number.isSafeInteger(index)||index<0||!/^[a-f0-9]{64}$/.test(sha256))throw new BadRequestException('上传分块身份无效');return resolve(studioMaterialRoot(),'studio-uploads',id,`${index}-${sha256}`);}
  async chunk(user:InMemoryUserAccount,id:string,index:number,body:unknown){
    const row=this.record(user,id,true);if(row.status!=='uploading')throw new ConflictException('上传已经结束');
    if(!Number.isSafeInteger(index)||index<0||index>=Math.ceil(row.size/row.chunkSize)||!Buffer.isBuffer(body)||body.length!==Math.min(row.chunkSize,row.size-index*row.chunkSize))throw new BadRequestException('分块序号或大小不匹配，请重新选择相同原文件');
    const sha256=bytesDigest(body),prior=row.chunks.find(chunk=>chunk.index===index);if(prior){if(prior.sha256!==sha256)throw new ConflictException('这个分块已写入不同内容');return this.view(row);}
    await withStudioFileLease(studioMaterialRoot(),'upload',row.id,()=>writeImmutableBytes(this.chunkPath(id,index,sha256),body));row.chunks.push({index,sha256,size:body.length});row.chunks.sort((a,b)=>a.index-b.index);row.revision++;return this.view(row);
  }
  async cancel(user:InMemoryUserAccount,id:string,input:unknown){const row=this.record(user,id),command=validate(z.object({expectedRevision:z.number().int().min(0)}).strict(),input);if(row.status==='cancelled')return this.view(row);if(row.status!=='uploading'||row.revision!==command.expectedRevision)throw new ConflictException('上传状态已变化，请读取保存状态');row.status='cancelled';row.revision++;await this.maintenance.scheduleUpload(row.id,row.sha256,user.id,'cancel-upload:'+row.id);return this.view(row);}
  async complete(user:InMemoryUserAccount,id:string){
    const row=this.record(user,id,true);if(row.status==='cancelled')throw new ConflictException('上传已取消，请重新开始');
    if(row.status==='completed'){const material=this.store.find('studioSourceMaterials',{id:row.materialId});if(!material)throw new NotFoundException('对应资料已不可用');assertMaterialAccess(user,material,this.students);return{upload:this.view(row),material:studioMaterialView(material),version:materialVersion(material)};}
    if(row.chunks.length!==Math.ceil(row.size/row.chunkSize))throw new BadRequestException('还有分块未上传，请继续上传');
    assertStudioAssetAvailable(this.store,row.sha256);
    await withStudioFileLease(studioMaterialRoot(),'upload',row.id,()=>withStudioSourceFileWrite(this.store,row.sha256,()=>assembleImmutableFile({size:row.size,sha256:row.sha256,target:studioMaterialFile(row.sha256),chunks:row.chunks.map(chunk=>({...chunk,path:this.chunkPath(row.id,chunk.index,chunk.sha256)})),validHeader:header=>header.subarray(0,5).toString()==='%PDF-'})));
    const now=new Date().toISOString(),materialId=this.store.nextId('studio_material'),taskId=this.store.nextId('task'),payload={materialId,sha256:row.sha256};
    const material:StudioMaterialRecord={id:materialId,ownerUserId:user.id,studentId:row.studentId,subject:row.subject,kind:'pdf',filename:row.name,title:row.name.replace(/\.pdf$/iu,'').slice(0,180),sha256:row.sha256,byteSize:row.size,pageCount:0,pages:[],hasPageImages:false,status:'queued',processingTaskId:taskId,error:null,createdAt:now,updatedAt:now,processingAccess:row.guardianId?{guardianId:row.guardianId,accessVersion:row.accessVersion!}:undefined,processingPages:[]};
    this.store.append('studioSourceMaterials',material);await this.store.enqueueTask({id:taskId,kind:'studio.material.process',ownerUserId:user.id,requestKey:'material-upload:'+row.id,payloadHash:sourceDigest(payload),payload,createdAt:now,maxAttempts:2});row.materialId=materialId;row.status='completed';row.completedAt=now;row.revision++;await this.maintenance.scheduleUpload(row.id,row.sha256,user.id,'complete-upload:'+row.id);return{upload:this.view(row),material:studioMaterialView(material),version:materialVersion(material)};
  }
  async progress(user:InMemoryUserAccount,id:string):Promise<StudioMaterialProgress>{const row=this.store.find('studioSourceMaterials',{id}) as StudioMaterialRecord|undefined;if(!row)throw new NotFoundException('来源资料不存在');assertMaterialAccess(user,row,this.students);const task=row.processingTaskId?await this.store.tasks.get(row.processingTaskId):null,pages=row.processingPages??(['ready','needs_review'].includes(row.status??'ready')?row.pages.map(page=>({page:page.page,method:page.method??'pdf_text' as const,warnings:page.warnings??[],completedAt:row.updatedAt??row.createdAt,resumed:false})):[]);return{materialId:id,status:materialTaskStatus(row,task?.state),pageCount:row.pageCount||null,processedPages:pages.length,ocrPages:pages.filter(page=>['ocr','hybrid'].includes(page.method)).length,unreadablePages:pages.filter(page=>page.method==='unreadable').length,pages:structuredClone(pages),task:task?{id:task.id,state:task.state,version:task.version,errorCode:task.errorCode}:null};}
  async cancelProcessing(user:InMemoryUserAccount,id:string,input:unknown){
    const row=this.store.find('studioSourceMaterials',{id}) as StudioMaterialRecord|undefined;if(!row)throw new NotFoundException('来源资料不存在');assertMaterialAccess(user,row,this.students);
    const command=validate(z.object({expectedTaskVersion:z.number().int().min(1),requestKey:key}).strict(),input),hash=sourceDigest(command.expectedTaskVersion),prior=row.commands?.find(value=>value.key===command.requestKey);
    if(prior){if(prior.hash!==hash||prior.kind!=='cancel')throw new ConflictException('请求标识已使用');return this.progress(user,id);}
    const task=row.processingTaskId&&await this.store.tasks.get(row.processingTaskId);if(!task||!['queued','running','retry_wait','cancel_requested'].includes(task.state))throw new ConflictException('资料处理当前不能取消');
    await this.store.controlTask({id:task.id,action:'cancel',expectedVersion:command.expectedTaskVersion,actorId:user.id});row.status='cancelled';row.updatedAt=new Date().toISOString();row.commands=[...(row.commands??[]),{key:command.requestKey,hash,kind:'cancel'}];const view=await this.progress(user,id);view.task={id:task.id,state:['running','cancel_requested'].includes(task.state)?'cancel_requested':'cancelled',version:task.version+1,errorCode:null};return view;
  }
}
