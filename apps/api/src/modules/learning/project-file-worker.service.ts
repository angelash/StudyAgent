import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { acquireStudioFileLease, acquireStudioPurgeFence, assertNoFileLinks, pruneDeadStudioFileLeases, revokeStudioUploadFiles, StudioFileCollectionPending } from '../../infrastructure/studio-file-coordination';
import type { TaskRow } from '../../infrastructure/task-repository';
import { StudentsService } from '../students/students.service';
import { projectFileAuthority } from './course-project-access';
import { processProjectFile, projectNormalizationVersion } from './project-file-processing';
import { projectAssetDirectory, projectAssetFile, projectFileRoot, projectUploadDirectory, projectWorkingDirectory, publishProjectFile, verifyProjectFile } from './project-file-storage';
import { projectAssetReferenced, scheduleProjectFileCollection } from './project-file.service';

const active=['queued','running','retry_wait','cancel_requested'];
@Injectable()
export class ProjectFileWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?:ReturnType<typeof setInterval>;private current?:Promise<boolean>;private stopping=false;private abort?:AbortController;private sweptAt=0;private collectionDelayMs=30000;
  private readonly logger=new Logger(ProjectFileWorkerService.name);
  constructor(private readonly store:InMemoryStoreService,private readonly students:StudentsService){}
  onApplicationBootstrap(){if(process.env.STUDY_WORKER_ENABLED==='false'||!this.store.persistence.durable)return;this.timer=setInterval(()=>void this.runNext().catch(()=>this.logger.warn('Project file work retained')),2000);this.timer.unref();}
  async onModuleDestroy(){this.stopping=true;if(this.timer)clearInterval(this.timer);this.abort?.abort();await this.current?.catch(()=>{});}
  async runNext(sweep=true){if(this.current||this.stopping)return false;const pending=this.execute(sweep);this.current=pending;try{return await pending;}finally{this.current=undefined;}}
  async sweep(){
    for(const task of await this.store.tasks.recoverableProjectFileCollections())await this.store.transaction(()=>this.store.controlTask({id:task.id,action:'retry',expectedVersion:task.version,actorId:'system-project-files'}));
    await this.store.transaction(async()=>{
      for(const record of this.store.inspect('projectAssetUploads')){
        const row=this.store.find('projectAssetUploads',{id:record.id})!;
        if(row.status==='uploading'){
          let invalid=false;try{projectFileAuthority(this.store,this.students,row);}catch{invalid=true;}
          if(invalid||Date.parse(row.expiresAt)<=Date.now()){row.status=invalid?'cancelled':'expired';row.revision++;}
        }
        if(row.status!=='uploading'&&!row.filesCollectedAt)await scheduleProjectFileCollection(this.store,'project-upload',row.id,row.ownerUserId);
      }
      for(const record of this.store.inspect('projectAssets')){
        const row=this.store.find('projectAssets',{id:record.id})!;
        if(['queued','processing'].includes(row.status)){
          try{projectFileAuthority(this.store,this.students,row);}catch{
            row.status='cancelled';row.revision++;const task=await this.store.tasks.get(row.taskId);
            if(task&&active.includes(task.state))await this.store.controlTask({id:task.id,action:'cancel',expectedVersion:task.version,actorId:'system-project-files'});
          }
        }
        if(['cancelled','deleting','deleted'].includes(row.status)&&!row.filesCollectedAt)await scheduleProjectFileCollection(this.store,'project-asset',row.id,row.ownerUserId);
      }
      // Orphan targets can survive an interrupted complete before its database commit.
      for(const upload of this.store.select('projectAssetUploads',{status:['cancelled','expired']})){
        const id='project_asset_'+upload.id.slice('project_upload_'.length);
        if(!this.store.find('projectAssets',{id}))await scheduleProjectFileCollection(this.store,'project-asset',id,upload.ownerUserId);
      }
    });
  }
  private async execute(sweep:boolean){
    if(sweep&&Date.now()-this.sweptAt>60000){await this.sweep();this.sweptAt=Date.now();}
    const task=await this.store.tasks.claim(['project.asset.process','project.file.collect']);if(!task)return false;
    const controller=new AbortController();this.abort=controller;
    const beat=setInterval(()=>void this.store.tasks.heartbeat(task.id,task.leaseToken!).then(async okay=>{
      if(!okay)controller.abort();else if(task.kind==='project.asset.process')await this.store.requestContext(()=>{
        const row=this.store.find('projectAssets',{id:String(task.payload.assetId)});if(!row||row.taskId!==task.id||!['queued','processing'].includes(row.status))throw Error('project_file_unavailable');projectFileAuthority(this.store,this.students,row);
      });
    }).catch(()=>controller.abort()),2000);beat.unref();
    try{
      if(task.kind==='project.file.collect')await this.collect(task,controller.signal);else await this.process(task,controller.signal);
    }catch(error){
      if(task.kind==='project.file.collect')await this.store.tasks.deferProjectFileCollection(task.id,task.leaseToken!,error instanceof StudioFileCollectionPending?error.code:'project_collection_pending',this.collectionDelayMs).catch(()=>{});
      else{const message=error instanceof Error?error.message:'';
        const allowed=['project_text_limit','project_text_encoding_invalid','project_pdf_encrypted_or_invalid','project_pdf_page_limit','project_pdf_geometry_invalid','project_preview_byte_limit','project_office_container_limit','project_office_container_invalid','project_office_type_mismatch','project_office_macros_unsupported','project_processor_unavailable','project_processor_protocol_invalid','project_document_invalid','audio_unavailable','invalid_audio','invalid_audio_duration','invalid_image'];
        await this.store.tasks.fail(task.id,task.leaseToken!,controller.signal.aborted?'project_processing_cancelled':allowed.includes(message)?message:'project_processing_failed',this.stopping).catch(()=>{});
      }
    }finally{clearInterval(beat);this.abort=undefined;}return true;
  }
  private async process(task:TaskRow,signal:AbortSignal){
    const id=String(task.payload.assetId),release=await acquireStudioFileLease(projectFileRoot(),'project-asset',id);
    try{
      const snapshot=await this.store.transaction(()=>{
        const row=this.store.find('projectAssets',{id});if(!row||row.taskId!==task.id||!['queued','processing'].includes(row.status))throw Error('project_file_unavailable');
        projectFileAuthority(this.store,this.students,row);row.status='processing';row.revision++;row.updatedAt=new Date().toISOString();return structuredClone(row);
      },{id:task.id,token:task.leaseToken!,mode:'checkpoint',progress:{stage:'decoding'}});
      const path=await verifyProjectFile(id,snapshot.original),directory=projectWorkingDirectory(id,task.id,task.leaseToken!);
      const result=await processProjectFile({assetId:id,path,directory,mediaType:snapshot.mediaType,signal});
      if(signal.aborted)throw Error('project_processing_cancelled');
      await this.store.transaction(async()=>{
        const row=this.store.find('projectAssets',{id});if(!row||row.taskId!==task.id||row.inputHash!==snapshot.inputHash||row.status!=='processing'||signal.aborted)throw Error('project_file_unavailable');
        projectFileAuthority(this.store,this.students,row);await verifyProjectFile(id,row.original);
        for(const output of result.files){const file=await publishProjectFile(id,output.name,output.bytes,output.mediaType);if(output.name.startsWith('display.'))row.display=file;else row.previews.push({page:Number(output.name.match(/^page-(\d+)/)![1]),file});}
        row.pageCount=result.pageCount;row.durationMs=result.durationMs;row.width=result.width;row.height=result.height;row.normalizationVersion=projectNormalizationVersion;row.status='ready';row.revision++;row.updatedAt=new Date().toISOString();
      },{id:task.id,token:task.leaseToken!,result:{assetId:id,normalizationVersion:projectNormalizationVersion}});
      await this.removeKnownDirectory(directory,'attempt').catch(()=>{/* Retain unknown working files for explicit collection. */});
    }finally{await release();}
  }
  private async collect(task:TaskRow,signal:AbortSignal){
    const kind=task.payload.targetKind,key=String(task.payload.key);if(kind!=='project-upload'&&kind!=='project-asset')throw Error('project_cleanup_identity_invalid');
    const directory=kind==='project-upload'?projectUploadDirectory(key):projectAssetDirectory(key),collection=kind==='project-upload'?'projectAssetUploads':'projectAssets';
    const check=async()=>{
      if(signal.aborted||this.stopping)throw new StudioFileCollectionPending('project_collection_interrupted');
      const row=this.store.find(collection,{id:key});
      if(row?.cleanupTaskId&&row.cleanupTaskId!==task.id)throw new StudioFileCollectionPending('project_collection_owner_changed');
      if(kind==='project-upload'){if(row?.status==='uploading')throw new StudioFileCollectionPending('project_upload_active');}
      else{
        const asset=this.store.find('projectAssets',{id:key});
        if(asset){if(!['cancelled','deleting','deleted'].includes(asset.status)||projectAssetReferenced(this.store,key))throw new StudioFileCollectionPending('project_file_referenced');
          const processing=await this.store.tasks.get(asset.taskId);if(processing&&active.includes(processing.state))throw new StudioFileCollectionPending('project_processing_active');
        }else if(this.store.find('projectAssetUploads',{id:'project_upload_'+key.slice('project_asset_'.length),status:['uploading','completed']}))throw new StudioFileCollectionPending('project_original_reserved');
      }
    };
    await this.store.transaction(check,{id:task.id,token:task.leaseToken!,mode:'checkpoint',progress:{stage:'collecting'}});
    if(kind==='project-upload')await revokeStudioUploadFiles(projectFileRoot(),key,'project-upload');
    const release=await acquireStudioPurgeFence(projectFileRoot(),kind,key,{generation:task.generation,taskId:task.id,token:task.leaseToken!});
    try{
      await pruneDeadStudioFileLeases(projectFileRoot(),kind,key);
      await this.store.transaction(async()=>{
        await check();
        await this.removeKnownDirectory(directory,kind==='project-upload'?'chunks':'asset');
        if(kind==='project-asset'){
          const working=resolve(projectFileRoot(),'project-assets','working',key);await this.removeKnownDirectory(working,'working');
        }
        const row=this.store.find(collection,{id:key});if(row){row.filesCollectedAt=new Date().toISOString();if(row.status==='deleting')row.status='deleted';}
      },{id:task.id,token:task.leaseToken!,result:{collected:true,targetKind:kind,key}});
    }finally{await release();}
  }
  /** Unknown files and live atomic writers remain for inspection; never recursively delete a guessed tree. */
  private async removeKnownDirectory(directory:string,scope:'chunks'|'asset'|'working'|'task'|'attempt'){
    await assertNoFileLinks(directory);let entries;try{entries=await fs.readdir(directory,{withFileTypes:true});}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}
    const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
    for(const entry of entries){
      const path=resolve(directory,entry.name);await assertNoFileLinks(path);
      if(entry.isDirectory()){
        if(scope==='working'&&new RegExp('^task_'+uuid+'$').test(entry.name))await this.removeKnownDirectory(path,'task');
        else if(scope==='task'&&new RegExp('^'+uuid+'$').test(entry.name))await this.removeKnownDirectory(path,'attempt');
        else throw new StudioFileCollectionPending('project_collection_unknown_directory');
      }else if(entry.isFile()){
        const writer=entry.name.match(new RegExp('^writing-([1-9]\\d*)-'+uuid+'$'));
        if(writer){try{process.kill(Number(writer[1]),0);throw new StudioFileCollectionPending('project_atomic_writer_active');}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}}
        const known=writer||scope==='chunks'&&/^\d+-[a-f0-9]{64}$/.test(entry.name)||scope==='asset'&&/^(original\.(png|jpg|pdf|txt|webm|ogg|wav|mp3|m4a|docx|xlsx|pptx)|display\.(png|wav)|page-[1-9]\d*\.png|assembling-[a-f0-9]{64}-[a-f0-9-]{36})$/.test(entry.name)||scope==='attempt'&&/^(page-[1-9]\d*\.png|normalized\.wav)$/.test(entry.name);
        if(!known)throw new StudioFileCollectionPending('project_collection_unknown_file');await fs.unlink(path);
      }else throw new StudioFileCollectionPending('project_collection_unknown_entry');
    }
    await fs.rmdir(directory);
  }
}
