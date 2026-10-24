import { Injectable,Logger,OnApplicationBootstrap,OnModuleDestroy } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import type { TaskRow } from '../../infrastructure/task-repository';
import { bytesDigest } from '../../infrastructure/immutable-files';
import { workspaceRoot } from '../../infrastructure/workspace-paths';
import { acquireStudioPurgeFence,assertNoFileLinks,pruneDeadStudioFileLeases,revokeStudioUploadFiles,studioCoordinationRoot,StudioFileCollectionPending,type FileKind } from '../../infrastructure/studio-file-coordination';
import { inventoryStudioCollection,removeInventoriedStudioFile,removeEmptyStudioDirectory } from '../../infrastructure/studio-file-inventory';
import { studioMaterialRoot,type StudioMaterialAssetRecord } from './studio-material-storage';

const kind='studio.material.collect',active=new Set(['queued','running','retry_wait','cancel_requested']),day=86400000;
const payloadSchema=z.object({targetKind:z.enum(['source','upload']),key:z.string().min(1).max(180),graceMs:z.number().int().min(0).max(day)}).strict();
type Payload=z.infer<typeof payloadSchema>;
@Injectable()
export class StudioMaterialMaintenanceService implements OnApplicationBootstrap,OnModuleDestroy{
  private timer?:ReturnType<typeof setInterval>;private current?:Promise<boolean>;private stopping=false;private lastSweep=0;private pendingDelayMs=30000;
  private readonly logger=new Logger(StudioMaterialMaintenanceService.name);
  constructor(private readonly store:InMemoryStoreService){}
  onApplicationBootstrap(){if(process.env.STUDY_WORKER_ENABLED==='false'||!this.store.persistence.durable)return;this.timer=setInterval(()=>{void this.runNext().catch(()=>this.logger.error('Material collection remains pending'));},3000);this.timer.unref();}
  async onModuleDestroy(){this.stopping=true;if(this.timer)clearInterval(this.timer);await this.current?.catch(()=>{});}
  private requestKey(payload:Payload,salt:string){return'material-cleanup:'+bytesDigest(Buffer.from(JSON.stringify([payload,salt])));}
  async schedule(targetKind:FileKind,key:string,ownerUserId:string,salt:string,graceMs=0){
    const payload=payloadSchema.parse({targetKind,key,graceMs});studioCoordinationRoot(studioMaterialRoot(),targetKind,key);
    const requestKey=this.requestKey(payload,salt),prior=await this.store.tasks.find(ownerUserId,kind,requestKey);
    if(prior){if(['failed','cancelled'].includes(prior.state)){await this.store.controlTask({id:prior.id,action:'retry',expectedVersion:prior.version,actorId:'system-material-cleanup'});return prior.id;}return null;}
    const id='task_'+bytesDigest(Buffer.from(JSON.stringify([ownerUserId,kind,requestKey])));await this.store.enqueueTask({id,kind,ownerUserId,requestKey,payloadHash:bytesDigest(Buffer.from(JSON.stringify(payload))),payload,createdAt:new Date().toISOString(),maxAttempts:5});return id;
  }
  async scheduleUpload(id:string,sha256:string,ownerUserId:string,salt:string){const upload=await this.schedule('upload',id,ownerUserId,salt),source=await this.schedule('source',sha256,ownerUserId,salt);return Number(Boolean(upload))+Number(Boolean(source));}
  private sourceReferenced(sha256:string){
    const {materialReferences}=require(resolve(workspaceRoot(),'scripts/operations/material-audit.cjs'));
    const rows=['studioSourceMaterials','sourceCourses','studioMaterialUploads','studioMaterialAssets','studioWhiteboards','studioLearningPacks'].flatMap(collection=>this.store.inspect(collection as 'studioSourceMaterials').map(body=>({collection,body})));
    const references=materialReferences(rows,[],Date.now());if(references.issues.length)throw new StudioFileCollectionPending('material_collection_reference_unknown');return Boolean(references.assets.get(sha256)?.references.size);
  }
  private async candidates(){
    const root=studioMaterialRoot(),result:Array<{targetKind:FileKind;key:string}>=[],seen=new Set<string>();
    const scan=async(relative:string,parse:(name:string)=>{targetKind:FileKind;key:string}|null)=>{
      const directory=resolve(root,relative);await assertNoFileLinks(directory);let names:string[];try{names=await fs.readdir(directory);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}
      if(names.length>100000)throw new StudioFileCollectionPending('material_collection_inventory_limit');
      for(const name of names){const item=parse(name);if(!item)continue;const stat=await fs.lstat(resolve(directory,name));if(stat.isSymbolicLink()||Date.now()-stat.mtimeMs<day)continue;const identity=item.targetKind+':'+item.key;if(!seen.has(identity)){seen.add(identity);result.push(item);}}
    };
    await scan('studio-materials',name=>{const match=name.match(/^([a-f0-9]{64})\.(?:pdf|txt)$/)??name.match(/^assembling-([a-f0-9]{64})-[a-f0-9-]{36}$/);return match?{targetKind:'source',key:match[1]}:null;});
    await scan('studio-materials/processed',name=>/^[a-f0-9]{64}$/.test(name)?{targetKind:'source',key:name}:null);
    await scan('studio-uploads',name=>/^studio_upload_[a-f0-9-]{36}$/.test(name)?{targetKind:'upload',key:name}:null);
    for(const sha256 of await this.store.tasks.studioSourceOrigins())if(!seen.has('source:'+sha256)){seen.add('source:'+sha256);result.push({targetKind:'source',key:sha256});}return result;
  }
  async sweep(){
    const candidates=await this.candidates(),recoverable=await this.store.tasks.recoverableMaterialCollections();
    if(recoverable.length)await this.store.transaction(async()=>{for(const task of recoverable)await this.store.controlTask({id:task.id,action:'retry',expectedVersion:task.version,actorId:'system-material-cleanup'});});
    await this.store.transaction(async()=>{
      let scheduled=0;
      for(const upload of this.store.inspect('studioMaterialUploads')){
        if(scheduled>=100)break;if(upload.filesCollectedAt)continue;
        if(upload.status==='uploading'&&Date.parse(upload.expiresAt)<=Date.now()){const row=this.store.find('studioMaterialUploads',{id:upload.id})!;row.status='cancelled';row.revision++;}
        const row=this.store.find('studioMaterialUploads',{id:upload.id})!;
        if(row.status!=='uploading')scheduled+=await this.scheduleUpload(row.id,row.sha256,row.ownerUserId,'closed-upload:'+row.id);
      }
      for(const asset of this.store.inspect('studioMaterialAssets')){
        if(scheduled>=100)break;if(this.sourceReferenced(asset.id))continue;
        if(asset.state==='deleting'){
          const pending=asset.cleanupTaskId&&await this.store.tasks.get(asset.cleanupTaskId);
          if(!pending){if(await this.schedule('source',asset.id,'system-material-cleanup','recover-source:'+asset.id+':'+asset.generation))scheduled++;}
        }else if(Date.now()-Date.parse(asset.updatedAt)>=day){if(await this.schedule('source',asset.id,'system-material-cleanup','unused-source:'+asset.id+':'+asset.generation,day))scheduled++;}
      }
      for(const candidate of candidates){
        if(scheduled>=100)break;
        if(candidate.targetKind==='source'&&this.store.find('studioMaterialAssets',{id:candidate.key}))continue;
        if(candidate.targetKind==='source'&&this.sourceReferenced(candidate.key))continue;
        const upload=candidate.targetKind==='upload'&&this.store.find('studioMaterialUploads',{id:candidate.key});if(upload&&upload.status==='uploading'&&(!Number.isFinite(Date.parse(upload.expiresAt))||Date.parse(upload.expiresAt)>Date.now()))continue;
        if(await this.schedule(candidate.targetKind,candidate.key,'system-material-cleanup','orphan:'+candidate.targetKind+':'+candidate.key,day))scheduled++;
      }
    });
  }
  async runNext(sweep=true):Promise<boolean>{if(this.current||this.stopping)return false;const pending=this.execute(sweep);this.current=pending;try{return await pending;}finally{this.current=undefined;}}
  private async execute(sweep:boolean){
    if(sweep&&Date.now()-this.lastSweep>=60000){try{await this.sweep();}catch{this.logger.warn('Material inventory sweep remains pending');}this.lastSweep=Date.now();}
    const task=await this.store.tasks.claim([kind]);if(!task)return false;let lost=false;
    const heartbeat=setInterval(()=>{void this.store.tasks.heartbeat(task.id,task.leaseToken!,{stage:'collecting'}).then(ok=>{if(!ok)lost=true;}).catch(()=>{lost=true;});},4000);heartbeat.unref();
    try{await this.collect(task,payloadSchema.parse(task.payload),()=>lost||this.stopping);}
    catch(error){const code=error instanceof StudioFileCollectionPending?error.code:'material_collection_pending';await this.store.tasks.deferMaterialCollection(task.id,task.leaseToken!,code,this.pendingDelayMs).catch(()=>{});}
    finally{clearInterval(heartbeat);}return true;
  }
  private owner(task:TaskRow,payload:Payload,asset?:StudioMaterialAssetRecord){
    if(payload.targetKind==='source'){
      const current=this.store.find('studioMaterialAssets',{id:payload.key});
      if(!current||current.state!=='deleting'||current.cleanupTaskId!==task.id||current.cleanupToken!==asset?.cleanupToken||current.generation!==asset?.generation)throw new StudioFileCollectionPending('material_collection_owner_changed');
    }else{
      const upload=this.store.find('studioMaterialUploads',{id:payload.key});if(upload?.status==='uploading'){if(!Number.isFinite(Date.parse(upload.expiresAt)))throw new StudioFileCollectionPending('material_upload_state_unknown');if(Date.parse(upload.expiresAt)>Date.now())throw new StudioFileCollectionPending('material_upload_active');}
    }
  }
  private async collect(task:TaskRow,payload:Payload,interrupted:()=>boolean){
    const processingIds=payload.targetKind==='source'?await this.store.tasks.studioSourceTaskIds(payload.key):[];
    if(payload.graceMs){const preview=await inventoryStudioCollection(studioMaterialRoot(),payload.targetKind,payload.key,processingIds);if(preview.files.some(file=>Date.now()-file.stat.mtimeMs<payload.graceMs))throw new StudioFileCollectionPending('material_collection_grace_period');}
    const fence={id:task.id,token:task.leaseToken!,mode:'checkpoint' as const,progress:{stage:'collecting'}};let retained=false;
    const asset=await this.store.transaction(async()=>{
      if(payload.targetKind==='upload'){
        const upload=this.store.find('studioMaterialUploads',{id:payload.key});if(upload?.status==='uploading'){
          if(!Number.isFinite(Date.parse(upload.expiresAt)))throw new StudioFileCollectionPending('material_upload_state_unknown');
          if(Date.parse(upload.expiresAt)>Date.now()){retained=true;return;}
          upload.status='cancelled';upload.revision++;await this.schedule('source',upload.sha256,upload.ownerUserId,'expired-upload:'+upload.id);
        }return;
      }
      let row=this.store.find('studioMaterialAssets',{id:payload.key});
      if(this.sourceReferenced(payload.key)){if(row?.state==='deleting')throw new StudioFileCollectionPending('material_source_reference_changed');retained=true;return;}
      if(!row){row={id:payload.key,state:'available',generation:1,updatedAt:new Date().toISOString()};this.store.append('studioMaterialAssets',row);}
      if(row.state==='deleting'){
        if(typeof row.cleanupToken!=='string'||!/^[a-f0-9-]{36}$/.test(row.cleanupToken)||!row.cleanupTaskId)throw new StudioFileCollectionPending('material_collection_owner_unknown');
        if(row.cleanupTaskId!==task.id){const previous=row.cleanupTaskId&&await this.store.tasks.get(row.cleanupTaskId);if(previous&&active.has(previous.state))throw new StudioFileCollectionPending('material_collection_already_pending');row.cleanupTaskId=task.id;}
      }else{row.state='deleting';row.generation++;row.cleanupTaskId=task.id;row.cleanupToken=randomUUID();row.updatedAt=new Date().toISOString();}
      return structuredClone(row);
    },fence);
    if(retained){await this.store.transaction(()=>{},{id:task.id,token:task.leaseToken!,result:{retained:true,files:0}});return;}
    const guard=async()=>{if(interrupted())throw new StudioFileCollectionPending('material_collection_interrupted');await this.store.transaction(()=>this.owner(task,payload,asset),fence);};
    await guard();const root=studioMaterialRoot();
    if(payload.targetKind==='upload')await revokeStudioUploadFiles(root,payload.key);
    else if((await this.store.tasks.activeStudioSourceTasks(payload.key)).length)throw new StudioFileCollectionPending('material_processing_task_active');
    let release:(()=>Promise<void>)|undefined=await acquireStudioPurgeFence(root,payload.targetKind,payload.key,{generation:asset?.generation??0,taskId:task.id,token:asset?.cleanupToken??task.leaseToken!});
    try{
      await guard();await pruneDeadStudioFileLeases(root,payload.targetKind,payload.key);
      if(payload.targetKind==='source'&&(await this.store.tasks.activeStudioSourceTasks(payload.key)).length)throw new StudioFileCollectionPending('material_processing_task_active');
      const inventory=await inventoryStudioCollection(root,payload.targetKind,payload.key,processingIds);
      if(payload.graceMs&&inventory.files.some(file=>Date.now()-file.stat.mtimeMs<payload.graceMs)){
        await release();release=undefined;
        if(payload.targetKind==='source')await this.store.transaction(()=>{this.owner(task,payload,asset);const row=this.store.find('studioMaterialAssets',{id:payload.key})!;row.state='available';row.generation++;row.updatedAt=new Date().toISOString();delete row.cleanupTaskId;delete row.cleanupToken;},fence);
        throw new StudioFileCollectionPending('material_collection_grace_period');
      }
      let files=0,bytes=0;
      for(const file of inventory.files){await guard();if(await removeInventoriedStudioFile(file)){files++;bytes+=file.stat.size;}}
      for(const directory of inventory.directories){await guard();await removeEmptyStudioDirectory(directory);}
      await release();release=undefined;
      await this.store.transaction(()=>{
        this.owner(task,payload,asset);
        if(payload.targetKind==='source'){const row=this.store.find('studioMaterialAssets',{id:payload.key})!;row.state='available';row.generation++;row.updatedAt=new Date().toISOString();delete row.cleanupTaskId;delete row.cleanupToken;}
        else{const upload=this.store.find('studioMaterialUploads',{id:payload.key});if(upload)upload.filesCollectedAt=new Date().toISOString();}
      },{id:task.id,token:task.leaseToken!,result:{retained:false,files,bytes}});
    }finally{await release?.();}
  }
}
