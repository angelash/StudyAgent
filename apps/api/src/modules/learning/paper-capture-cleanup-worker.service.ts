import {Injectable,Logger,type OnApplicationBootstrap,type OnModuleDestroy} from '@nestjs/common';
import {promises as fs,type Stats} from 'node:fs';
import {resolve} from 'node:path';
import {InMemoryStoreService} from '../../infrastructure/in-memory-store.service';
import type {TaskRow} from '../../infrastructure/task-repository';
import {acquireStudioPurgeFence,assertNoFileLinks,pruneDeadStudioFileLeases,revokeStudioUploadFiles,StudioFileCollectionPending} from '../../infrastructure/studio-file-coordination';
import {verifyImmutableFile} from '../../infrastructure/immutable-files';
import {paperCaptureCleanupKind,paperCaptureFileReferenced,schedulePaperCaptureCleanup} from './paper-capture-cleanup';
import {studioMaterialRoot} from './studio-material-storage';
import type {PaperCaptureFileAsset} from './paper-capture-record';

const refers=(value:unknown,ids:Set<string>):boolean=>typeof value==='string'?ids.has(value):Array.isArray(value)?value.some(item=>refers(item,ids)):!!value&&typeof value==='object'&&Object.values(value).some(item=>refers(item,ids));
@Injectable()
export class PaperCaptureCleanupWorkerService implements OnApplicationBootstrap,OnModuleDestroy{
 private timer?:ReturnType<typeof setInterval>;private current?:Promise<boolean>;private stopping=false;private sweptAt=0;private collectionDelayMs=30000;
 private readonly logger=new Logger(PaperCaptureCleanupWorkerService.name);
 constructor(private readonly store:InMemoryStoreService){}
 onApplicationBootstrap(){if(process.env.STUDY_WORKER_ENABLED==='false'||!this.store.persistence.durable)return;this.timer=setInterval(()=>void this.runNext().catch(()=>this.logger.warn('Paper capture cleanup retained')),2000);this.timer.unref();}
 async onModuleDestroy(){this.stopping=true;if(this.timer)clearInterval(this.timer);await this.current?.catch(()=>{});}
 async runNext(sweep=true){if(this.current||this.stopping)return false;const work=this.execute(sweep);this.current=work;try{return await work;}finally{this.current=undefined;}}
 async sweep(){
  for(const task of await this.store.tasks.recoverablePaperCaptureCollections())await this.store.transaction(()=>this.store.controlTask({id:task.id,action:'retry',expectedVersion:task.version,actorId:'system-paper-capture'}));
  await this.store.transaction(async()=>{
   const at=new Date().toISOString();
   for(const upload of this.store.paperImageUploads){
    if(upload.status==='uploading'&&Date.parse(upload.expiresAt)<=Date.now()){
     upload.status='cancelled';upload.systemClosure='expired';upload.endedAt=at;upload.terminalCommandId=null;upload.revision++;
     for(const command of this.store.paperCaptureCommands)if(command.status==='preparing'&&'uploadId'in command.input&&command.input.uploadId===upload.id){command.status='rejected';command.at=at;command.errorCode='upload_expired';}
    }
    if(upload.status!=='uploading'&&!upload.filesCollectedAt)await schedulePaperCaptureCleanup(this.store,'paper-upload',upload.id,upload.actorId);
   }
   for(const asset of this.store.paperCaptureFileAssets)if(!paperCaptureFileReferenced(this.store,asset.id))await schedulePaperCaptureCleanup(this.store,'paper-file',asset.id,'system-paper-capture');
  });
 }
 private async execute(sweep:boolean){
  if(sweep&&Date.now()-this.sweptAt>60000){await this.sweep();this.sweptAt=Date.now();}
  const task=await this.store.tasks.claim([paperCaptureCleanupKind]);if(!task)return false;
  let interrupted=false;const beat=setInterval(()=>void this.store.tasks.heartbeat(task.id,task.leaseToken!).then(okay=>{if(!okay)interrupted=true;}).catch(()=>{interrupted=true;}),2000);beat.unref();
  try{await this.collect(task,()=>interrupted||this.stopping);}
  catch(error){await this.store.tasks.deferPaperCaptureCollection(task.id,task.leaseToken!,error instanceof StudioFileCollectionPending?error.code:'paper_collection_pending',this.collectionDelayMs);}
  finally{clearInterval(beat);}return true;
 }
 private async processingReference(asset:PaperCaptureFileAsset){
  if((await this.store.tasks.activePaperCaptureTasks()).some(task=>refers([task.payload,task.progress],new Set([asset.id,asset.sha256]))))return true;
  return asset.role==='pdf'&&(await this.store.tasks.activeStudioSourceTasks(asset.sha256)).length>0;
 }
 private async collect(task:TaskRow,interrupted:()=>boolean){
  // Earlier isolated31 uploads used the same durable kind with uploadId.
  const kind=task.payload.targetKind??(task.payload.uploadId?'paper-upload':null),key=String(task.payload.key??task.payload.uploadId??'');
  if(kind!=='paper-upload'&&kind!=='paper-file'||kind==='paper-upload'&&!/^paper_upload_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(key)||kind==='paper-file'&&!/^[a-f0-9]{64}$/.test(key))throw new StudioFileCollectionPending('paper_collection_identity_invalid');
  const checkpoint={id:task.id,token:task.leaseToken!,mode:'checkpoint' as const,progress:{stage:'collecting'}},complete={id:task.id,token:task.leaseToken!};
  let asset:PaperCaptureFileAsset|undefined,retained=false,obsolete=false;
  await this.store.transaction(async()=>{
   if(interrupted())throw new StudioFileCollectionPending('paper_collection_interrupted');
   if(kind==='paper-upload'){const row=this.store.find('paperImageUploads',{id:key});if(row?.status==='uploading')retained=true;return;}
   const row=this.store.find('paperCaptureFileAssets',{id:key});if(!row||row.state==='deleted'){obsolete=true;return;}
   if(row.cleanupTaskId!==task.id||row.state==='available'&&row.generation!==task.payload.generation){obsolete=true;return;}
   if(paperCaptureFileReferenced(this.store,key)||await this.processingReference(row)||row.state==='repairing'){retained=true;return;}
   if(row.state!=='deleting'){row.state='deleting';row.generation++;row.updatedAt=new Date().toISOString();}
   asset=structuredClone(row);
  },checkpoint);
  if(retained||obsolete){await this.store.transaction(()=>{},{...complete,result:{retained,obsolete}});return;}
  const guard=async()=>{
   if(interrupted())throw new StudioFileCollectionPending('paper_collection_interrupted');
   if(kind==='paper-upload'){if(this.store.find('paperImageUploads',{id:key})?.status==='uploading')throw new StudioFileCollectionPending('paper_upload_active');}
   else{const row=this.store.find('paperCaptureFileAssets',{id:key});if(!row||!asset||row.state!=='deleting'||row.generation!==asset.generation||row.cleanupTaskId!==task.id||paperCaptureFileReferenced(this.store,key)||await this.processingReference(row))throw new StudioFileCollectionPending('paper_file_reference_changed');}
  };
  const root=studioMaterialRoot();if(kind==='paper-upload')await revokeStudioUploadFiles(root,key,'paper-upload');
  const release=await acquireStudioPurgeFence(root,kind,key,{generation:asset?.generation??task.generation,taskId:task.id,token:task.leaseToken!});
  try{
   await pruneDeadStudioFileLeases(root,kind,key);
   await this.store.transaction(async()=>{
    await guard();let removed=0;
    if(kind==='paper-upload')removed=await this.removeChunks(resolve(root,'paper-image-uploads',key));
    else{
     removed+=await this.removeChunks(resolve(root,'paper-images','working',key),true);
     const current=asset!,extension=current.mediaType==='application/pdf'?'.pdf':current.mediaType==='image/jpeg'?'.jpg':'.png',file=resolve(root,'paper-images',current.role,current.sha256+extension);
     await assertNoFileLinks(file);let before:Stats|undefined;try{before=await fs.lstat(file);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
     if(before){if(!before.isFile())throw new StudioFileCollectionPending('paper_collection_unknown_entry');await verifyImmutableFile(file,current.sha256,current.bytes);await this.unchanged(file,before);await guard();await fs.unlink(file);removed++;}
    }
    await guard();const at=new Date().toISOString();
    if(kind==='paper-upload'){const row=this.store.find('paperImageUploads',{id:key});if(row)row.filesCollectedAt=at;}
    else{const row=this.store.find('paperCaptureFileAssets',{id:key})!;row.state='deleted';row.updatedAt=at;}
    return removed;
   },{...complete,result:{collected:true,targetKind:kind,key}});
  }finally{await release();}
 }
 private async unchanged(file:string,before:Stats){const after=await fs.lstat(file);if(!after.isFile()||after.dev!==before.dev||after.ino!==before.ino||after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw new StudioFileCollectionPending('paper_collection_file_changed');}
 private async removeChunks(directory:string,working=false){
  await assertNoFileLinks(directory);let entries;try{entries=await fs.readdir(directory,{withFileTypes:true});}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return 0;throw error;}
  const inventory:Array<{file:string;stat:Stats}>=[];
  for(const entry of entries){
   const file=resolve(directory,entry.name);await assertNoFileLinks(file);if(!entry.isFile())throw new StudioFileCollectionPending('paper_collection_unknown_entry');
   const writer=entry.name.match(/^writing-([1-9]\d*)-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
   if(writer){try{process.kill(Number(writer[1]),0);throw new StudioFileCollectionPending('paper_atomic_writer_active');}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}}
   else if(working||!/^(?:[0-9]|1[01])-[a-f0-9]{64}$/.test(entry.name))throw new StudioFileCollectionPending('paper_collection_unknown_file');
   inventory.push({file,stat:await fs.lstat(file)});
  }
  for(const entry of inventory){await this.unchanged(entry.file,entry.stat);await fs.unlink(entry.file);}
  await fs.rmdir(directory);return inventory.length;
 }
}
