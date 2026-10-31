import {BadRequestException,ConflictException,ForbiddenException,HttpException,Injectable,NotFoundException} from '@nestjs/common';
import {promises as fs} from 'node:fs';
import {resolve} from 'node:path';
import {z} from 'zod';
import {paperCaptureUploadCommandsSchema,type PaperCaptureUploadView,type PaperCapturePageView,type PaperCaptureUploadCommands} from '@study-agent/contracts';
import {InMemoryStoreService,type InMemoryUserAccount,type InMemoryAuthSession} from '../../infrastructure/in-memory-store.service';
import {bytesDigest,verifyImmutableFile,writeAtomicImmutableBytes} from '../../infrastructure/immutable-files';
import {assertNoFileLinks,withStudioFileLease,revokeStudioUploadFiles} from '../../infrastructure/studio-file-coordination';
import {validate} from '../../common/validation';
import {retentionDigest} from '../diagnostics/retention-anchor';
import {PaperCaptureCommandService} from './paper-capture-command.service';
import {PaperCaptureFileService} from './paper-capture-file.service';
import {preparePaperCaptureCommand,assertPaperImageUpload,paperCaptureFileId,PAPER_IMAGE_CHUNK_BYTES,PAPER_IMAGE_UPLOAD_EXPIRES_MS,type PaperImageUploadRecord} from './paper-capture-record';
import {paperImageFilesReceipt,persistPaperImageFiles,readPaperImageFile,verifyPaperImageFileSet} from './paper-capture-files';
import {renderPaperCaptureImage} from './paper-capture-image';
import {createPaperCapturePage,assertPaperCapturePage} from './paper-capture-page';
import type {PaperCapturePendingCommand} from './paper-capture-command';
import {studioMaterialRoot} from './studio-material-storage';
import {schedulePaperCaptureCleanup} from './paper-capture-cleanup';
import {beginPaperImageOperation} from './paper-capture-image-operation';

const querySchema=z.object({studentId:z.string().min(1).max(180).optional(),subject:z.enum(['math','chinese','english','chemistry']).optional()}).strict().refine(row=>Boolean(row.studentId)===Boolean(row.subject));
@Injectable()
export class PaperCaptureUploadService{
 constructor(private readonly store:InMemoryStoreService,private readonly commands:PaperCaptureCommandService,private readonly files:PaperCaptureFileService){if(!Object.hasOwn(store,'paperCaptureCommands')||!Object.hasOwn(store,'paperCapturePages'))throw Error('paper_capture_schema31_required');}
 private view(row:PaperImageUploadRecord):PaperCaptureUploadView{return{id:row.id,pageId:row.pageId,scope:structuredClone(row.scope),name:row.name,size:row.size,sha256:row.sha256,mediaType:row.mediaType,chunkSize:row.chunkSize,chunks:structuredClone(row.chunks),revision:row.revision,status:row.status,createdAt:row.createdAt,expiresAt:row.expiresAt,endedAt:row.endedAt};}
 private upload(user:InMemoryUserAccount,id:string,writing=false){
  const row=this.store.find('paperImageUploads',{id});if(!row)throw new NotFoundException('原图上传记录不存在。');if(row.actorId!==user.id)throw new ForbiddenException('这份上传只属于原账号。');this.commands.own(user,row.scope);
  if(writing){this.commands.writer(user,row.scope);if(row.status!=='uploading'||Date.parse(row.expiresAt)<=Date.now())throw new ConflictException('原上传已结束或过期，请保留原图后核对进度。');
   if(user.role==='student'){const access=row.learningAccess,guardian=access&&this.store.find('users',{id:access.guardianId,status:'active',role:['parent','admin']});if(!access||!guardian||!this.store.find('studentLearningAccess',{studentId:row.scope.studentId,userId:user.id,status:'enabled',version:access.accessVersion})||guardian.role!=='admin'&&!this.store.find('bindings',{studentId:row.scope.studentId,parentUserId:guardian.id,status:'active'}))throw new ForbiddenException('原上传的学习授权已变化，请保留原文件后重新确认。');}}
  return row;
 }
 private checkRevision(row:PaperImageUploadRecord,expected:number){if(row.revision!==expected)throw new ConflictException('上传进度已变化，请保留原命令并读取当前进度。');}
 private chunkPath(id:string,index:number,sha256:string){if(!/^paper_upload_[a-f0-9-]{36}$/.test(id)||!Number.isSafeInteger(index)||index<0||index>11||!/^[a-f0-9]{64}$/.test(sha256))throw new BadRequestException('原图分块身份无效。');return resolve(studioMaterialRoot(),'paper-image-uploads',id,index+'-'+sha256);}
 private async cleanup(row:PaperImageUploadRecord,_commandId:string,_reason:'complete'|'cancel'|'expired'){
  await schedulePaperCaptureCleanup(this.store,'paper-upload',row.id,row.actorId);
 }
 async start(user:InMemoryUserAccount,value:unknown,session:InMemoryAuthSession){
  const command=this.commands.parse(value);if(command.kind!=='upload')throw new BadRequestException('请使用完整原图上传命令。');const input=command.input;
  if(/[\\/\x00-\x1f\x7f]/.test(input.name)||!(input.mediaType==='image/png'?/\.png$/iu:/\.jpe?g$/iu).test(input.name))throw new BadRequestException('文件名、PNG/JPEG类型需要与原图一致。');
  return this.commands.transaction(async()=>{
   this.commands.writer(user,input.scope);const prior=this.commands.existing(user,input.scope,command);if(prior){if(prior.status!=='committed')throw new ConflictException('请先核对原上传命令。');return structuredClone(prior.result!);}
   if(this.store.find('paperCapturePages',{id:input.pageId}))throw new ConflictException('这个原页已保存，请读取原页；新图片需要新的页身份。');
   const originals=this.store.select('paperImageUploads',{pageId:input.pageId});for(const old of originals){if(old.actorId!==user.id||retentionDigest(old.scope)!==retentionDigest(input.scope)||old.sha256!==input.sha256||old.size!==input.size||old.mediaType!==input.mediaType)throw new ConflictException('原页身份已对应另一份文件或学习范围。');if(old.status==='uploading'&&Date.parse(old.expiresAt)>Date.now())throw new ConflictException('这张原图已有进行中的上传，请先读取原上传命令。');}
   if(this.store.select('paperImageUploads',{actorId:user.id,status:'uploading'}).filter(row=>Date.parse(row.expiresAt)>Date.now()).length>=12)throw new BadRequestException('请先完成或取消现有原图上传。');
   const at=new Date().toISOString(),id=this.store.nextId('paper_upload'),result={kind:'upload',uploadId:id,pageId:input.pageId,chunkSize:PAPER_IMAGE_CHUNK_BYTES,createdAt:at,expiresAt:new Date(Date.parse(at)+PAPER_IMAGE_UPLOAD_EXPIRES_MS).toISOString()},original=preparePaperCaptureCommand(user.id,input.scope,command,result,at);
   const learningAccess=user.role==='student'?{guardianId:session.guardianId!,accessVersion:session.accessVersion!}:undefined;if(user.role==='student'&&(!learningAccess?.guardianId||!learningAccess.accessVersion))throw new ForbiddenException('请使用当前孩子的实际学习授权上传。');
   const row:PaperImageUploadRecord={protocol:'paper-image-upload-record-v1',id,actorId:user.id,scope:structuredClone(input.scope),pageId:input.pageId,name:input.name,size:input.size,sha256:input.sha256,mediaType:input.mediaType,requestKey:command.requestKey,commandId:original.id,chunkSize:PAPER_IMAGE_CHUNK_BYTES,chunks:[],revision:0,status:'uploading',createdAt:at,expiresAt:result.expiresAt,endedAt:null,terminalCommandId:null,preparedFileIds:[],...(learningAccess?{learningAccess}:{})};assertPaperImageUpload(row);
   this.store.append('paperCaptureCommands',original);for(const old of originals)if(old.status==='uploading'){old.status='cancelled';old.endedAt=at;old.terminalCommandId=original.id;old.revision++;this.rejectPreparing(old,'upload_expired');await this.cleanup(old,original.id,'expired');}this.store.append('paperImageUploads',row);return result;
  });
 }
 get(user:InMemoryUserAccount,id:string){return this.view(this.upload(user,id));}
 originalCommands(user:InMemoryUserAccount,id:string):PaperCaptureUploadCommands{
  const upload=this.upload(user,id);assertPaperImageUpload(upload);
  const lookup=(commandId:string)=>{const command=this.store.find('paperCaptureCommands',{id:commandId});if(!command||command.actorId!==user.id)throw new ConflictException('原上传命令需要核对，请保留当前记录。');return this.commands.result(user,command.requestKey);};
  return paperCaptureUploadCommandsSchema.parse({uploadId:id,initialization:lookup(upload.commandId),terminal:upload.terminalCommandId?lookup(upload.terminalCommandId):null});
 }
 list(user:InMemoryUserAccount,value:unknown){const query=validate(querySchema,value),scope=this.commands.scope(user,query.studentId??null,query.subject??null);return this.store.select('paperImageUploads',{actorId:user.id,'scope.studentId':scope.studentId,'scope.subject':scope.subject}).map(row=>this.view(row));}
 async chunk(user:InMemoryUserAccount,id:string,index:number,body:unknown){
  const initial=await this.store.requestContext(()=>this.upload(user,id,true));if(!Buffer.isBuffer(body)||!Number.isSafeInteger(index)||index<0||index>=Math.ceil(initial.size/initial.chunkSize)||body.length!==Math.min(initial.chunkSize,initial.size-index*initial.chunkSize))throw new BadRequestException('分块序号或字节数不符，请重新选择相同原图。');const sha256=bytesDigest(body),target=this.chunkPath(id,index,sha256);
  return withStudioFileLease(studioMaterialRoot(),'paper-upload',id,async()=>{
   await this.store.requestContext(()=>{const row=this.upload(user,id,true),prior=row.chunks.find(chunk=>chunk.index===index);if(prior&&prior.sha256!==sha256)throw new ConflictException('这个原图分块已保存不同字节。');});
   await assertNoFileLinks(target);await writeAtomicImmutableBytes(target,body);
   return this.commands.transaction(()=>{const row=this.upload(user,id,true),prior=row.chunks.find(chunk=>chunk.index===index);if(prior){if(prior.sha256!==sha256||prior.bytes!==body.length)throw new ConflictException('原图分块已变化。');}else{row.chunks.push({index,sha256,bytes:body.length});row.chunks.sort((a,b)=>a.index-b.index);row.revision++;}assertPaperImageUpload(row);return this.view(row);});
  });
 }
 private rejectPreparing(upload:PaperImageUploadRecord,code:string){for(const row of this.store.select('paperCaptureCommands',{actorId:upload.actorId}))if(row.status==='preparing'&&'uploadId'in row.input&&row.input.uploadId===upload.id){row.status='rejected';row.errorCode=code;row.at=new Date().toISOString();}}
 async cancel(user:InMemoryUserAccount,id:string,value:unknown){
  const command=this.commands.parse(value);if(command.kind!=='cancelUpload'||command.uploadId!==id)throw new BadRequestException('取消命令与原上传身份不一致。');
  const result=await this.commands.transaction(async()=>{const original=this.upload(user,id),prior=this.commands.existing(user,original.scope,command);if(prior?.status==='committed')return structuredClone(prior.result!);const row=this.upload(user,id,true);this.checkRevision(row,command.input.expectedRevision);
   const at=new Date().toISOString(),result={kind:'cancelUpload',uploadId:id,revision:row.revision+1,cancelledAt:at},saved=preparePaperCaptureCommand(user.id,row.scope,command,result,at);this.store.append('paperCaptureCommands',saved);row.status='cancelled';row.endedAt=at;row.terminalCommandId=saved.id;row.revision++;this.rejectPreparing(row,'upload_cancelled');await this.cleanup(row,saved.id,'cancel');return result;});
  await revokeStudioUploadFiles(studioMaterialRoot(),id,'paper-upload');return result;
 }
 async complete(user:InMemoryUserAccount,id:string,value:unknown){
  const command=this.commands.parse(value);if(command.kind!=='completeUpload'||command.uploadId!==id)throw new BadRequestException('完成命令与原上传身份不一致。');const probe=await this.store.requestContext(()=>{const original=this.upload(user,id),prior=this.commands.existing(user,original.scope,command);return prior?.status==='committed'?structuredClone(prior.result!):null;});if(probe)return probe;
  const releaseOperation=beginPaperImageOperation();let generation:number|undefined;
  try{return await withStudioFileLease(studioMaterialRoot(),'paper-upload',id,async()=>{
   const begin=await this.commands.transaction(()=>{const original=this.upload(user,id),prior=this.commands.existing(user,original.scope,command);if(prior?.status==='committed')return{upload:structuredClone(original),command:structuredClone(prior)};const row=this.upload(user,id,true);this.checkRevision(row,command.input.expectedRevision);if(row.chunks.length!==Math.ceil(row.size/row.chunkSize))throw new ConflictException('请先上传全部原图分块。');const pending=this.commands.begin(user,row.scope,command);return{upload:structuredClone(row),command:structuredClone(pending)};});if(begin.command.status==='committed')return structuredClone(begin.command.result!);generation=begin.command.generation;
   const buffers:Buffer[]=[];for(const chunk of begin.upload.chunks){const target=this.chunkPath(id,chunk.index,chunk.sha256);await assertNoFileLinks(target);await verifyImmutableFile(target,chunk.sha256,chunk.bytes);const bytes=await fs.readFile(target);if(bytes.length!==chunk.bytes||bytesDigest(bytes)!==chunk.sha256)throw new BadRequestException('原图分块校验失败。');buffers.push(bytes);}const bytes=Buffer.concat(buffers);if(bytes.length!==begin.upload.size||bytesDigest(bytes)!==begin.upload.sha256)throw new BadRequestException('原图完整校验失败。');
   let rendered:Awaited<ReturnType<typeof renderPaperCaptureImage>>;try{rendered=await renderPaperCaptureImage(bytes,begin.upload.mediaType,begin.upload.sha256,begin.upload.pageId);}catch(error){if(error instanceof HttpException)throw error;throw new BadRequestException('原图无法按声明的PNG/JPEG完整解码，请保留原文件并核对格式。');}const receipt=paperImageFilesReceipt(bytes,rendered);
   const staged=await this.commands.transaction(async()=>{const original=this.upload(user,id),current=this.commands.existing(user,original.scope,command);if(current?.status==='committed')return{state:'committed' as const,result:structuredClone(current.result!)};const row=this.upload(user,id,true);this.checkRevision(row,command.input.expectedRevision);if(!current||current.status!=='preparing'||current.generation!==generation)throw new ConflictException('原操作已变化，请先核对完整命令。');const stages=await this.files.reserve(receipt.files);current.fileIds=stages.map(stage=>stage.id);row.preparedFileIds=[...current.fileIds];return{state:'prepared' as const,stages};});if(staged.state==='committed')return staged.result;
   return this.files.leased(staged.stages,async()=>{
    await this.store.requestContext(()=>{this.upload(user,id,true);this.files.check(staged.stages);});await persistPaperImageFiles(studioMaterialRoot(),bytes,rendered);await verifyPaperImageFileSet(studioMaterialRoot(),receipt);
    return this.commands.transaction(async()=>{const row=this.upload(user,id),prior=this.commands.existing(user,row.scope,command);if(prior?.status==='committed')return structuredClone(prior.result!);this.upload(user,id,true);this.checkRevision(row,command.input.expectedRevision);this.files.check(staged.stages);if(!prior||prior.status!=='preparing'||prior.generation!==generation)throw new ConflictException('原完成操作已撤回或重试，请核对原结果。');if(this.store.find('paperCapturePages',{id:row.pageId}))throw new ConflictException('原页已由另一操作保存，请核对原命令。');
     const at=new Date().toISOString(),page=createPaperCapturePage(row.name,{protocol:'paper-capture-attribution-v1',scope:structuredClone(row.scope),ownerUserId:user.id,createdAt:at},receipt),result={kind:'completeUpload',uploadId:id,pageId:page.id,revision:1,versionFingerprint:page.selectedVersionFingerprint,completedAt:at};this.store.append('paperCapturePages',page);row.status='completed';row.endedAt=at;row.terminalCommandId=prior.id;row.revision++;const saved=this.commands.finish(user,row.scope,command,generation!,result,at);await this.cleanup(row,prior.id,'complete');return saved;
    });
   });
  });}catch(error){if(generation!==undefined)await this.commands.reject(user.id,command,generation,error instanceof HttpException?'http_'+error.getStatus():'paper_upload_failed');throw error;}finally{releaseOperation();}
 }
 private page(user:InMemoryUserAccount,id:string){const row=this.store.find('paperCapturePages',{id});if(!row)throw new NotFoundException('原页不存在。');this.commands.audience(user,row.attribution.scope);return assertPaperCapturePage(row);}
 pageView(user:InMemoryUserAccount,id:string):PaperCapturePageView{const page=this.page(user,id);return{id:page.id,filename:page.filename,scope:page.attribution.scope,revision:page.revision,selectedVersionFingerprint:page.selectedVersionFingerprint,canEdit:page.attribution.ownerUserId===user.id,ownerClosed:page.attribution.ownerUserId===null,source:page.versions[0].receipt.source,versions:page.versions.map(row=>({version:row.receipt.version,createdAt:row.createdAt}))};}
 async image(user:InMemoryUserAccount,id:string,version:string,role:'original'|'baseline'|'derived'){
  validate(z.string().regex(/^[a-f0-9]{64}$/),version);const probe=await this.store.requestContext(()=>{const page=this.page(user,id),row=page.versions.find(row=>row.receipt.version.fingerprint===version);if(!row)throw new NotFoundException('这个原页处理版本不存在。');const file=row.receipt.files.find(file=>file.role===role)!,asset=this.store.find('paperCaptureFileAssets',{id:paperCaptureFileId(file.role,file.sha256)});if(!asset||asset.state!=='available')throw new ConflictException('原文件正在核对或恢复。');return{receipt:row.receipt,mediaType:file.mediaType,stage:{id:asset.id,generation:asset.generation}};});
  return this.files.leased([probe.stage],async()=>{await this.store.requestContext(()=>{this.page(user,id);this.files.check([probe.stage]);});let bytes:Buffer;try{bytes=await readPaperImageFile(studioMaterialRoot(),probe.receipt,role);}catch{throw new ConflictException({code:'paper_original_file_unavailable',message:'原图或处理图需要核对，请保留资料后恢复原件。'});}await this.store.requestContext(()=>{this.page(user,id);this.files.check([probe.stage]);});return{bytes,mediaType:probe.mediaType};});
 }
}
