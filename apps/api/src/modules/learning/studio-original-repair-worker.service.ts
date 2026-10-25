import {ConflictException,Injectable,Logger,OnApplicationBootstrap,OnModuleDestroy} from '@nestjs/common';
import {resolve} from 'node:path';
import {InMemoryStoreService} from '../../infrastructure/in-memory-store.service';
import type {TaskRow} from '../../infrastructure/task-repository';
import {cleanupStudioOriginalRepair,recoverStudioOriginal,type OriginalRepairPhase} from '../../infrastructure/studio-original-repair';
import {StudioFileCollectionPending,withStudioFileLease} from '../../infrastructure/studio-file-coordination';
import {StudentsService} from '../students/students.service';
import {StudioMaterialMaintenanceService} from './studio-material-maintenance.service';
import {studioMaterialRoot,type StudioMaterialAssetRecord} from './studio-material-storage';
import {assertOriginalRepairAsset,assertOriginalRepairAuthority,originalCleanupKind,originalRepairKind,RepairAuthorityChanged,StudioOriginalRepairService} from './studio-original-repair.service';

const waiting=new Set(['material_collection_owner_active','material_collection_fence_busy','material_file_process_active_or_unknown','original_repair_producer_active','material_processing_task_active','original_repair_main_worker_active','original_repair_worker_stopped']);
@Injectable()
export class StudioOriginalRepairWorkerService implements OnApplicationBootstrap,OnModuleDestroy{
 private timer?:ReturnType<typeof setInterval>;private current?:Promise<boolean>;private stopping=false;
 private readonly logger=new Logger(StudioOriginalRepairWorkerService.name);
 private pendingDelayMs=30000;
 // Used by isolated integration tests to interrupt the real task between file/SQL stages.
 private afterPhase?: (phase:OriginalRepairPhase|'cleanup_finished'|'before_domain_complete')=>Promise<void>;
 constructor(private readonly store:InMemoryStoreService,private readonly students:StudentsService,private readonly repairs:StudioOriginalRepairService,private readonly maintenance:StudioMaterialMaintenanceService){}
 onApplicationBootstrap(){if(process.env.STUDY_WORKER_ENABLED==='false'||!this.store.persistence.durable)return;this.timer=setInterval(()=>void this.runNext().catch(()=>this.logger.warn('Original repair remains pending')),2500);this.timer.unref();}
 async onModuleDestroy(){this.stopping=true;if(this.timer)clearInterval(this.timer);await this.current?.catch(()=>{});}
 async sweep(){
  const hashes=await this.store.requestContext(()=>this.store.inspect('studioMaterialAssets').filter(row=>row.state==='repairing').map(row=>row.id));
  for(const sha256 of hashes)await this.store.transaction(async()=>{
   const asset=this.store.find('studioMaterialAssets',{id:sha256});if(asset?.state!=='repairing'||!asset.repair)return;
   const row=this.store.find('studioOriginalRepairs',{id:asset.repair.identity.id});
   let revoked=!row;
   if(row)try{assertOriginalRepairAuthority(this.store,this.students,row);}catch{revoked=true;}
   if(revoked||asset.repair.cleanupRequested||row?.status==='cleaning'){
    asset.repair.cleanupRequested=true;
    if(row&&row.status!=='cleaning'){row.status='cleaning';row.revision++;row.updatedAt=new Date().toISOString();}
    const main=await this.store.tasks.get(asset.repair.identity.taskId);
    if(main&&['queued','running','retry_wait'].includes(main.state))await this.store.controlTask({id:main.id,action:'cancel',expectedVersion:main.version,actorId:'system-material-repair'});
    await this.repairs.scheduleCleanup(asset);
   }
  });
 }
 async runNext(){if(this.current||this.stopping)return false;const work=this.execute();this.current=work;try{return await work;}finally{this.current=undefined;}}
 private checkpoint(task:TaskRow){return{id:task.id,token:task.leaseToken!,mode:'checkpoint' as const,progress:{stage:task.kind===originalCleanupKind?'cleaning':'restoring'}};}
 private async execute(){
  await this.sweep();const task=await this.store.tasks.claim([originalRepairKind,originalCleanupKind]);if(!task)return false;
  let lost=false;const heartbeat=setInterval(()=>void this.store.tasks.heartbeat(task.id,task.leaseToken!).then(ok=>{if(!ok)lost=true;}).catch(()=>{lost=true;}),4000);heartbeat.unref();
  const interrupted=()=>{if(this.stopping)throw new StudioFileCollectionPending('original_repair_worker_stopped');if(lost)throw new ConflictException('恢复任务租约已变化');};
  try{if(task.kind===originalCleanupKind)await this.cleanup(task,interrupted);else await this.restore(task,interrupted);}
  catch(error){
   const code=error instanceof StudioFileCollectionPending?error.code:error instanceof RepairAuthorityChanged?'original_repair_authority_changed':error instanceof ConflictException?'original_repair_transaction_conflict':'original_repair_failed';
   if(waiting.has(code)){
    if(task.kind===originalCleanupKind)await this.store.tasks.deferOriginalRepairCleanup(task.id,task.leaseToken!,code,this.pendingDelayMs).catch(()=>{});
    else await this.store.tasks.deferOriginalRepair(task.id,task.leaseToken!,code,this.pendingDelayMs).catch(()=>{});
   }else await this.store.tasks.fail(task.id,task.leaseToken!,code,code==='original_repair_transaction_conflict').catch(()=>{});
   if(error instanceof RepairAuthorityChanged)await this.sweep().catch(()=>{});
  }finally{clearInterval(heartbeat);}return true;
 }
 private async restore(task:TaskRow,interrupted:()=>void){
  const guard=async()=>{
   interrupted();return this.store.transaction(async()=>{
    const row=this.store.find('studioOriginalRepairs',{id:String(task.payload.repairId)});
    if(!row||row.taskId!==task.id||row.identity.sha256!==task.payload.sha256||!['queued','restoring'].includes(row.status))throw new RepairAuthorityChanged();
    assertOriginalRepairAuthority(this.store,this.students,row);assertOriginalRepairAsset(this.store.find('studioMaterialAssets',{id:row.identity.sha256}),row);
    const upload=this.store.find('studioMaterialUploads',{id:row.uploadId});
    if(!upload||upload.ownerUserId!==row.ownerUserId||upload.studentId!==row.studentId||upload.subject!==row.subject||upload.repairId!==row.id||upload.revision!==row.uploadRevision||upload.status!=='uploading'||upload.sha256!==row.identity.sha256||upload.size!==row.identity.size)throw new RepairAuthorityChanged();
    if((await this.store.tasks.activeStudioSourceTasks(row.identity.sha256)).length)throw new StudioFileCollectionPending('material_processing_task_active');
    if(row.status==='queued'){row.status='restoring';row.revision++;row.updatedAt=new Date().toISOString();}
    return structuredClone(row);
   },this.checkpoint(task));
  };
  const row=await guard(),upload=await this.store.requestContext(()=>structuredClone(this.store.find('studioMaterialUploads',{id:row.uploadId})));
  if(!upload||!/^studio_upload_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(upload.id)||upload.status!=='uploading'||upload.repairId!==row.id||upload.revision!==row.uploadRevision||upload.sha256!==row.identity.sha256||upload.size!==row.identity.size||upload.chunks.some((chunk,index)=>chunk.index!==index))throw new RepairAuthorityChanged();
  await withStudioFileLease(studioMaterialRoot(),'upload',row.uploadId,()=>recoverStudioOriginal({root:studioMaterialRoot(),identity:row.identity,baseline:row.baseline,chunks:upload.chunks.map(chunk=>({...chunk,path:resolve(studioMaterialRoot(),'studio-uploads',upload.id,`${chunk.index}-${chunk.sha256}`)})),guard:async()=>{await guard();},afterPhase:this.afterPhase}));
  await this.afterPhase?.('before_domain_complete');interrupted();
  await this.store.transaction(async()=>{
   const current=this.store.find('studioOriginalRepairs',{id:row.id});if(!current||current.status!=='restoring')throw new RepairAuthorityChanged();
   const material=assertOriginalRepairAuthority(this.store,this.students,current),asset=this.store.find('studioMaterialAssets',{id:row.identity.sha256});assertOriginalRepairAsset(asset,current);
   const retained=this.store.find('studioMaterialUploads',{id:row.uploadId});if(!retained||retained.repairId!==row.id||retained.revision!==row.uploadRevision)throw new RepairAuthorityChanged();
   const now=new Date().toISOString();current.status='completed';current.completedAt=now;current.updatedAt=now;current.revision++;current.receipt={sha256:row.identity.sha256,size:row.identity.size,completedAt:now};
   retained.status='completed';retained.materialId=row.materialId;retained.completedAt=now;retained.revision++;
   if(material.fileCheck?.version===row.materialVersion){material.fileCheck.original='verified';material.fileCheck.checkedAt=now;material.fileCheck.canRegenerate=material.fileCheck.pages.some(page=>['missing','mismatch'].includes(page.state));}
   this.release(asset!);await this.maintenance.scheduleUpload(row.uploadId,row.identity.sha256,row.ownerUserId,'repair-complete:'+row.id);
  },{id:task.id,token:task.leaseToken!,result:{repairId:row.id,sha256:row.identity.sha256,size:row.identity.size}});
 }
 private release(asset:StudioMaterialAssetRecord){asset.state='available';asset.generation++;asset.updatedAt=new Date().toISOString();delete asset.repair;}
 private async cleanup(task:TaskRow,interrupted:()=>void){
  const guard=async()=>{
   interrupted();return this.store.transaction(()=>{
    const asset=this.store.find('studioMaterialAssets',{id:String(task.payload.sha256)}),repair=asset?.repair;
    if(!asset||asset.state!=='repairing'||!repair||repair.identity.id!==task.payload.repairId||repair.cleanupTaskId!==task.id||!repair.cleanupRequested||asset.generation!==repair.identity.generation)throw new RepairAuthorityChanged();
    return structuredClone(asset);
   },this.checkpoint(task));
  };
  const asset=await guard(),repair=asset.repair!,main=await this.store.tasks.get(repair.identity.taskId);
  if(main&&['running','cancel_requested'].includes(main.state)&&Number(main.leaseUntil)>Date.now())throw new StudioFileCollectionPending('original_repair_main_worker_active');
  const result=await cleanupStudioOriginalRepair({root:studioMaterialRoot(),identity:repair.identity,baseline:repair.baseline,guard:async()=>{await guard();},afterPhase:this.afterPhase});
  await this.afterPhase?.('before_domain_complete');interrupted();
  await this.store.transaction(async()=>{
   const current=this.store.find('studioMaterialAssets',{id:asset.id});
   if(current?.state!=='repairing'||current.repair?.identity.id!==repair.identity.id||current.repair.cleanupTaskId!==task.id||!current.repair.cleanupRequested||current.generation!==repair.identity.generation)throw new RepairAuthorityChanged();
   const row=this.store.find('studioOriginalRepairs',{id:repair.identity.id});if(row){row.status='cancelled';row.revision++;row.updatedAt=new Date().toISOString();row.completedAt=row.updatedAt;}
   const upload=this.store.find('studioMaterialUploads',{id:repair.uploadId});if(upload&&upload.repairId===repair.identity.id){upload.status='cancelled';upload.revision++;}
   this.release(current);await this.maintenance.scheduleUpload(repair.uploadId,asset.id,'system-material-repair','repair-cleanup:'+repair.identity.id);
  },{id:task.id,token:task.leaseToken!,result:{repairId:repair.identity.id,original:result.original}});
 }
}
