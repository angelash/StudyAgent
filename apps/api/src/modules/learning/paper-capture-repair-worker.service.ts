import {ConflictException,ForbiddenException,Injectable,Logger,type OnApplicationBootstrap,type OnModuleDestroy} from '@nestjs/common';
import {promises as fs} from 'node:fs';
import {resolve} from 'node:path';
import {z} from 'zod';
import {InMemoryStoreService} from '../../infrastructure/in-memory-store.service';
import type {TaskRow} from '../../infrastructure/task-repository';
import {acquireStudioPurgeFence,assertNoFileLinks,pruneDeadStudioFileLeases,revokeStudioUploadFiles,withStudioFileLease,StudioFileCollectionPending} from '../../infrastructure/studio-file-coordination';
import {retentionDigest} from '../diagnostics/retention-anchor';
import {PaperCaptureCommandService} from './paper-capture-command.service';
import {PaperCaptureRepairService,paperRepairAsset,assertPaperRepairAsset,paperRepairFileIdentity,schedulePaperRepairCleanup,schedulePaperRepairUploadCleanup} from './paper-capture-repair.service';
import {repairExactPaperFile,cleanupExactPaperRepair,type PaperRepairFileIdentity} from './paper-capture-repair-files';
import {assertPaperRepairRecord,assertPaperRepairUpload,paperRepairUploadChunks,paperRepairTaskKind,paperRepairCleanupKind,paperRepairUploadCleanupKind,paperRepairObservationSchema,type PaperRepairUploadRecord} from './paper-capture-repair-record';
import {observePaperCaptureFile,recheckPaperCaptureObservation} from './paper-capture-file-observation';
import {studioMaterialRoot} from './studio-material-storage';
import {paperCaptureFileReferenced,schedulePaperCaptureCleanup} from './paper-capture-cleanup';
import {StudioMaterialMaintenanceService} from './studio-material-maintenance.service';

const same=(a:unknown,b:unknown)=>retentionDigest(a)===retentionDigest(b);
function pending(code:string):never{throw new StudioFileCollectionPending(code);}
@Injectable()
export class PaperCaptureRepairWorkerService implements OnApplicationBootstrap,OnModuleDestroy{
 private timer?:ReturnType<typeof setInterval>;private current?:Promise<boolean>;private stopping=false;private abort?:AbortController;private sweptAt=0;private collectionDelayMs=30000;private readonly logger=new Logger(PaperCaptureRepairWorkerService.name);
 constructor(private readonly store:InMemoryStoreService,private readonly commands:PaperCaptureCommandService,private readonly repairs:PaperCaptureRepairService,private readonly maintenance:StudioMaterialMaintenanceService){}
 onApplicationBootstrap(){if(process.env.STUDY_WORKER_ENABLED==='false'||!this.store.persistence.durable)return;this.timer=setInterval(()=>void this.runNext().catch(()=>this.logger.warn('Exact paper repair remains durable')),1500);this.timer.unref();}
 async onModuleDestroy(){this.stopping=true;if(this.timer)clearInterval(this.timer);this.abort?.abort();await this.current?.catch(()=>{});}
 async runNext(sweep=true){if(this.current||this.stopping)return false;const work=this.execute(sweep);this.current=work;try{return await work;}finally{this.current=undefined;}}
 async sweep(){
  for(const task of await this.store.tasks.recoverablePaperRepairCollections())await this.commands.transaction(()=>this.store.controlTask({id:task.id,action:'retry',expectedVersion:task.version,actorId:'system-paper-repair'}));
  await this.commands.transaction(async()=>{
   const at=new Date().toISOString();for(const saved of this.store.inspect('paperCaptureRepairUploads')){const row=this.store.find('paperCaptureRepairUploads',{id:saved.id})!;if(row.status==='uploading'&&Date.parse(row.expiresAt)<=Date.now()){row.status='cancelled';row.systemClosure='expired';row.endedAt=at;row.revision++;assertPaperRepairUpload(row);}if(row.status==='cancelled'&&!row.filesCollectedAt)await schedulePaperRepairUploadCleanup(this.store,row);}
   for(const row of this.store.inspect('paperCaptureRepairs')){const asset=paperRepairAsset(this.store,row.intent.selection),repair=asset.row.paperCaptureRepair;if(!repair||repair.repairId!==row.id)continue;const task=await this.store.tasks.get(row.intent.taskId);if(repair.cleanupRequested||row.attribution.ownerUserId===null||task?.state==='cancelled'){repair.cleanupRequested=true;await schedulePaperRepairCleanup(this.store,row);}}
  });
 }
 private async execute(sweep:boolean){
  if(sweep&&Date.now()-this.sweptAt>60000){await this.sweep();this.sweptAt=Date.now();}const task=await this.store.tasks.claim([paperRepairTaskKind,paperRepairCleanupKind,paperRepairUploadCleanupKind]);if(!task)return false;
  const abort=new AbortController();this.abort=abort;const beat=setInterval(()=>void this.store.tasks.heartbeat(task.id,task.leaseToken!).then(okay=>{if(!okay)abort.abort();}).catch(()=>abort.abort()),2000);beat.unref();
  try{if(task.kind===paperRepairTaskKind)await this.process(task,abort.signal);else if(task.kind===paperRepairCleanupKind)await this.cleanup(task,abort.signal);else await this.collectUpload(task,abort.signal);}
  catch(error){
   const declared=error instanceof StudioFileCollectionPending?error.code:error instanceof ForbiddenException?'paper_repair_authorization_changed':error instanceof ConflictException?'paper_repair_source_changed':error instanceof Error&&/^(paper_[a-z0-9_]+)$/.test(error.message)?error.message:'paper_repair_interrupted';
   if(task.kind!==paperRepairTaskKind)await this.store.tasks.deferPaperRepairCollection(task.id,task.leaseToken!,declared,this.collectionDelayMs);
   else{
    const retryable=this.stopping||error instanceof StudioFileCollectionPending&&/^(material_(?:file_process|collection_owner|collection_fence)|paper_repair_partial_unknown_or_active)/.test(error.code);await this.store.tasks.fail(task.id,task.leaseToken!,declared,retryable).catch(()=>{});
    await this.commands.transaction(async()=>{const row=this.store.find('paperCaptureRepairs',{id:String(task.payload.repairId)});if(!row||row.publication)return;const asset=paperRepairAsset(this.store,row.intent.selection),repair=asset.row.paperCaptureRepair,actual=await this.store.tasks.get(task.id);if(repair&&(repair.cleanupRequested||row.attribution.ownerUserId===null||actual?.state==='cancelled'||declared==='paper_repair_authorization_changed')){repair.cleanupRequested=true;await schedulePaperRepairCleanup(this.store,row);}});
   }
   this.logger.warn('Paper repair '+task.id+': '+declared);
  }finally{clearInterval(beat);this.abort=undefined;}return true;
 }
 private async process(task:TaskRow,signal:AbortSignal){
  let stage='checking_repair';const checkpoint=()=>({id:task.id,token:task.leaseToken!,mode:'checkpoint' as const,progress:{stage,repairId:task.payload.repairId}});
  const current=()=>{if(signal.aborted||this.stopping)throw Error('paper_repair_interrupted');const row=this.store.find('paperCaptureRepairs',{id:String(task.payload.repairId)});if(!row)throw new ForbiddenException('原准确恢复记录已删除。');return{row,...this.repairs.authorizeWork(row,task)};};
  const snapshot=await this.commands.transaction(()=>{const work=current();return{identity:paperRepairFileIdentity(work.row,work.repair),baseline:structuredClone(work.repair.baseline),upload:structuredClone(work.upload)};},checkpoint());
  const guard=async()=>{await this.commands.transaction(()=>{current();},checkpoint());};
  await withStudioFileLease(studioMaterialRoot(),'paper-repair-upload',snapshot.upload.id,()=>repairExactPaperFile({root:studioMaterialRoot(),identity:snapshot.identity,baseline:snapshot.baseline,chunks:snapshot.upload.chunks.map(chunk=>({path:this.repairs.chunkPath(snapshot.upload.id,chunk.index,chunk.sha256),sha256:chunk.sha256,bytes:chunk.bytes})),guard,afterPhase:async phase=>{stage=phase;await guard();},commit:()=>this.commands.transaction(async()=>{
   const work=current(),at=new Date().toISOString(),body={protocol:'paper-capture-repair-publication-v1' as const,repairId:work.row.id,target:structuredClone(work.row.intent.selection.target),sourceFingerprint:work.row.intent.selection.sourceFingerprint,role:work.row.intent.selection.role,sha256:work.row.intent.selection.sha256,bytes:work.row.intent.selection.bytes,assetGeneration:work.repair.generation,taskGeneration:task.generation,restoredAt:at};work.row.publication={...body,fingerprint:retentionDigest(body)};assertPaperRepairRecord(work.row);work.repair.published=true;work.repair.cleanupRequested=true;work.asset.row.state='available';work.asset.row.updatedAt=at;await schedulePaperRepairCleanup(this.store,work.row);await schedulePaperRepairUploadCleanup(this.store,work.upload);
  },{id:task.id,token:task.leaseToken!,result:{repairId:String(task.payload.repairId),intentFingerprint:snapshot.identity.intentFingerprint,sha256:snapshot.identity.sha256,bytes:snapshot.identity.bytes,assetGeneration:snapshot.identity.generation,publicationGeneration:task.generation}})}));
 }
 private async cleanup(task:TaskRow,signal:AbortSignal){
  const identity=task.payload.identity as PaperRepairFileIdentity,baseline=paperRepairObservationSchema.parse(task.payload.baseline);if(task.payload.repairId!==identity?.repairId||task.payloadHash!==retentionDigest(task.payload))pending('paper_repair_cleanup_identity_unknown');
  const current=async()=>{
   if(signal.aborted||this.stopping)pending('paper_repair_cleanup_interrupted');const row=identity.kind==='source'?this.store.find('studioMaterialAssets',{id:identity.key}):this.store.find('paperCaptureFileAssets',{id:identity.key}),repair=row?.paperCaptureRepair;
   if(!row||!repair||repair.repairId!==identity.repairId||repair.intentFingerprint!==identity.intentFingerprint||repair.taskId!==identity.taskId||repair.generation!==identity.generation||row.generation!==identity.generation||repair.token!==identity.token||repair.cleanupTaskId!==task.id||!repair.cleanupRequested||!same(repair.baseline,baseline))pending('paper_repair_cleanup_asset_changed');
   const original=await this.store.tasks.get(identity.taskId);if(!original||['queued','running','retry_wait','cancel_requested'].includes(original.state))pending('paper_repair_writer_still_active');
   if(repair!.published&&(original.state!=='succeeded'||original.result?.repairId!==identity.repairId||original.result?.intentFingerprint!==identity.intentFingerprint||original.result?.sha256!==identity.sha256||original.result?.bytes!==identity.bytes||original.result?.assetGeneration!==identity.generation))pending('paper_repair_cleanup_publication_unknown');
   const discardBaseline=!repair!.published&&(identity.kind==='paper-file'?!paperCaptureFileReferenced(this.store,identity.key,false):!this.maintenance.sourceReferencedOutsidePaperRepair(identity.key,identity.repairId));return{row:row!,repair:repair!,discardBaseline};
  };
  const checkpoint={id:task.id,token:task.leaseToken!,mode:'checkpoint' as const,progress:{stage:'cleaning_exact_repair',repairId:identity.repairId}},snapshot=await this.commands.transaction(current,checkpoint),guard=async()=>{await this.commands.transaction(async()=>{if((await current()).discardBaseline!==snapshot.discardBaseline)pending('paper_repair_retained_reference_changed');},checkpoint);};
  await cleanupExactPaperRepair({root:studioMaterialRoot(),identity,baseline,committed:snapshot.repair.published,discardBaseline:snapshot.discardBaseline,guard});
  await this.commands.transaction(async()=>{const work=await current();if(work.discardBaseline!==snapshot.discardBaseline)pending('paper_repair_retained_reference_changed');const upload=this.store.find('paperCaptureRepairUploads',{id:work.repair.uploadId});delete work.row.paperCaptureRepair;if(work.row.state==='repairing')work.row.state='available';work.row.updatedAt=new Date().toISOString();if(upload)await schedulePaperRepairUploadCleanup(this.store,upload);if(identity.kind==='paper-file'){if(!paperCaptureFileReferenced(this.store,identity.key))await schedulePaperCaptureCleanup(this.store,'paper-file',identity.key,'system-paper-repair');}else await this.maintenance.schedule('source',identity.key,'system-paper-repair','paper-repair-finished:'+identity.repairId);},{id:task.id,token:task.leaseToken!,result:{repairId:identity.repairId,published:snapshot.repair.published,discardedBaseline:snapshot.discardBaseline,filesFinished:true}});
 }
 private async collectUpload(task:TaskRow,signal:AbortSignal){
  const payload=z.object({uploadId:z.string().regex(/^paper_repair_upload_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),chunks:z.array(z.object({index:z.number().int().min(0).max(79),sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().positive().max(1024*1024)}).strict()).max(80),bytes:z.number().int().positive().max(80*1024*1024)}).strict().parse(task.payload);if(task.payloadHash!==retentionDigest(payload)||new Set(payload.chunks.map(chunk=>chunk.index)).size!==payload.chunks.length)pending('paper_repair_upload_cleanup_identity_unknown');
  const checkpoint={id:task.id,token:task.leaseToken!,mode:'checkpoint' as const,progress:{stage:'collecting_repair_upload'}},check=async()=>{
   if(signal.aborted||this.stopping)pending('paper_repair_upload_cleanup_interrupted');const row=this.store.find('paperCaptureRepairUploads',{id:payload.uploadId});if(row){assertPaperRepairUpload(row);if(row.status==='uploading'||!same(paperRepairUploadChunks(row),payload.chunks)||row.selection.bytes!==payload.bytes)pending('paper_repair_upload_still_active');}
   const active=[...this.store.inspect('paperCaptureFileAssets'),...this.store.inspect('studioMaterialAssets')].find(asset=>asset.paperCaptureRepair?.uploadId===payload.uploadId)?.paperCaptureRepair;
   if(active){const task=await this.store.tasks.get(active.taskId);if(!active.cleanupRequested||task&&['queued','running','retry_wait','cancel_requested'].includes(task.state))pending('paper_repair_upload_writer_active');}return row;
  },guard=async()=>{await this.commands.transaction(check,checkpoint);};
  await guard();await revokeStudioUploadFiles(studioMaterialRoot(),payload.uploadId,'paper-repair-upload');const release=await acquireStudioPurgeFence(studioMaterialRoot(),'paper-repair-upload',payload.uploadId,{generation:task.generation,taskId:task.id,token:task.leaseToken!});
  try{
   await guard();await pruneDeadStudioFileLeases(studioMaterialRoot(),'paper-repair-upload',payload.uploadId);const directory=resolve(studioMaterialRoot(),'paper-repair-uploads',payload.uploadId);await assertNoFileLinks(directory);
   let names:string[]=[];try{names=await fs.readdir(directory);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}if(names.length>81)pending('paper_repair_upload_inventory_limit');
   for(const name of names){const file=resolve(directory,name);await assertNoFileLinks(file);
    if(name==='working'){
     const stat=await fs.lstat(file);if(!stat.isDirectory())pending('paper_repair_upload_partial_unknown');const partials=await fs.readdir(file);if(partials.length>100)pending('paper_repair_upload_partial_limit');
     for(const name of partials){const match=/^writing-([1-9]\d*)-([a-f0-9-]{36})$/.exec(name),temporary=resolve(file,name);await assertNoFileLinks(temporary);const before=await fs.lstat(temporary,{bigint:true});if(!match||!z.string().uuid().safeParse(match[2]).success||!before.isFile()||before.size>1048576n)pending('paper_repair_upload_partial_unknown');try{process.kill(Number(match[1]),0);pending('paper_repair_upload_partial_active');}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}await guard();const after=await fs.lstat(temporary,{bigint:true});if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs)pending('paper_repair_upload_partial_changed');await fs.unlink(temporary);}
     await fs.rmdir(file);continue;
    }
    const chunk=payload.chunks.find(chunk=>name===chunk.index+'-'+chunk.sha256);if(!chunk)pending('paper_repair_upload_unknown_file');const observed=await observePaperCaptureFile(file,1048576);if(observed.kind!=='regular'||observed.sha256!==chunk!.sha256||observed.size!==chunk!.bytes)pending('paper_repair_upload_chunk_changed');await guard();await recheckPaperCaptureObservation(file,observed);await fs.unlink(file);
   }
   await guard();try{await fs.rmdir(directory);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
   await this.commands.transaction(async()=>{const row=await check();if(row){row.filesCollectedAt=new Date().toISOString();assertPaperRepairUpload(row);}},{id:task.id,token:task.leaseToken!,result:{uploadId:payload.uploadId,filesFinished:true}});
  }finally{await release();}
 }
}
