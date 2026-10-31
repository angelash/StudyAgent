import {ConflictException,ForbiddenException,HttpException,Injectable,Logger,type OnApplicationBootstrap,type OnModuleDestroy} from '@nestjs/common';
import {resolve} from 'node:path';
import {InMemoryStoreService} from '../../infrastructure/in-memory-store.service';
import type {TaskRow} from '../../infrastructure/task-repository';
import {assertNoFileLinks,withStudioFileLease} from '../../infrastructure/studio-file-coordination';
import {verifyImmutableFile,writeAtomicImmutableBytes} from '../../infrastructure/immutable-files';
import {retentionDigest} from '../diagnostics/retention-anchor';
import {PaperCaptureCommandService} from './paper-capture-command.service';
import {PaperCaptureDerivationService} from './paper-capture-derivation.service';
import {PaperCaptureFileService,type PaperFileStage} from './paper-capture-file.service';
import {paperCaptureFileId} from './paper-capture-record';
import {paperCaptureDerivationKind,paperCaptureMaterialOrigin,assertPaperCaptureDerivation} from './paper-capture-derivation-record';
import {retainedPaperCapturePage,assertPaperCaptureGroupRecord} from './paper-capture-group-record';
import {derivePaperCapturePdf} from './paper-capture-derived-pdf';
import {assertStudioAssetAvailable,studioMaterialFile,studioMaterialRoot} from './studio-material-storage';
import type {StudioMaterialRecord} from './studio-material-access';
import {StudioMaterialMaintenanceService} from './studio-material-maintenance.service';
import {paperCaptureFileReferenced,schedulePaperCaptureCleanup} from './paper-capture-cleanup';

@Injectable()
export class PaperCaptureDerivationWorkerService implements OnApplicationBootstrap,OnModuleDestroy{
 private timer?:ReturnType<typeof setInterval>;private current?:Promise<boolean>;private stopping=false;private abort?:AbortController;
 private readonly logger=new Logger(PaperCaptureDerivationWorkerService.name);
 constructor(private readonly store:InMemoryStoreService,private readonly commands:PaperCaptureCommandService,private readonly derivations:PaperCaptureDerivationService,private readonly files:PaperCaptureFileService,private readonly maintenance:StudioMaterialMaintenanceService){}
 onApplicationBootstrap(){if(process.env.STUDY_WORKER_ENABLED==='false'||!this.store.persistence.durable)return;this.timer=setInterval(()=>void this.runNext().catch(()=>this.logger.warn('Paper derivation remains durable')),1500);this.timer.unref();}
 async onModuleDestroy(){this.stopping=true;if(this.timer)clearInterval(this.timer);this.abort?.abort();await this.current?.catch(()=>{});}
 async runNext(){if(this.current||this.stopping)return false;const work=this.execute();this.current=work;try{return await work;}finally{this.current=undefined;}}
 private async execute(){
  const task=await this.store.tasks.claim([paperCaptureDerivationKind]);if(!task)return false;const abort=new AbortController();this.abort=abort;let pdfSha256:string|undefined;
  const beat=setInterval(()=>void this.store.tasks.heartbeat(task.id,task.leaseToken!).then(okay=>{if(!okay)abort.abort();}).catch(()=>abort.abort()),2000);beat.unref();
  try{await this.process(task,abort.signal,value=>{pdfSha256=value;});}
  catch(error){
   const response=error instanceof HttpException?error.getResponse():null,declared=response&&typeof response==='object'&&'code'in response?String(response.code):null,message=error instanceof Error?error.message:'';
   const code=abort.signal.aborted?'paper_capture_interrupted':error instanceof ForbiddenException?'paper_capture_authorization_changed':declared==='paper_capture_group_version_changed'?declared:error instanceof ConflictException?'paper_capture_file_busy':message.startsWith('paper_')&&/^[a-z0-9_]{1,100}$/.test(message)?message:'paper_capture_derivation_failed';
   await this.store.tasks.fail(task.id,task.leaseToken!,code,this.stopping||code==='paper_capture_file_busy').catch(()=>{});this.logger.warn('Paper derivation '+task.id+': '+code);
   if(pdfSha256)await this.commands.transaction(async()=>{const id=paperCaptureFileId('pdf',pdfSha256!);if(!paperCaptureFileReferenced(this.store,id))await schedulePaperCaptureCleanup(this.store,'paper-file',id,task.ownerUserId);await this.maintenance.schedule('source',pdfSha256!,task.ownerUserId,'paper-derive:'+task.id+':'+task.generation);});
  }finally{clearInterval(beat);this.abort=undefined;}return true;
 }
 private async process(task:TaskRow,signal:AbortSignal,pdfPrepared:(sha256:string)=>void){
  const checkpoint=(stage:string,extra:Record<string,unknown>={})=>({id:task.id,token:task.leaseToken!,mode:'checkpoint' as const,progress:{stage,...extra}}),id=String(task.payload.derivationId);
  const current=()=>{if(signal.aborted||this.stopping)throw Error('paper_capture_interrupted');const row=this.store.find('paperCaptureDerivations',{id});if(!row||row.pdf)throw new ConflictException('原派生关系已结束或变化。');return{row,...this.derivations.authorizeWork(row,task)};};
  const snapshot=await this.commands.transaction(()=>{
   const work=current(),pageIds=[...new Set(work.group.history.flatMap(saved=>saved.version.pages.map(page=>page.pageId)))],pages=this.store.select('paperCapturePages',{id:pageIds});assertPaperCaptureGroupRecord(work.group,pages);
   const receipts=work.version.pages.map(reference=>{const page=pages.find(page=>page.id===reference.pageId),receipt=page?.versions.find(version=>version.receipt.version.fingerprint===reference.versionFingerprint)?.receipt;if(!receipt)throw new ConflictException('原页处理版本不存在。');return structuredClone(receipt);});
   const stages=new Map<string,PaperFileStage>();for(const receipt of receipts)for(const file of receipt.files){const key=paperCaptureFileId(file.role,file.sha256),asset=this.store.find('paperCaptureFileAssets',{id:key,state:'available'});if(!asset||asset.bytes!==file.bytes||asset.mediaType!==file.mediaType)throw new ConflictException('原件正在恢复或回收。');stages.set(key,{id:key,generation:asset.generation});}
   return{group:structuredClone(work.version),history:structuredClone(work.group.history.slice(0,work.version.revision-1).map(saved=>saved.version)),retained:pages.map(retainedPaperCapturePage),receipts,stages:[...stages.values()]};
  },checkpoint('checking_originals'));
  await this.files.leased(snapshot.stages,async()=>{
   await this.commands.transaction(()=>{current();this.files.check(snapshot.stages);},checkpoint('deriving_pdf'));
   const pdf=await derivePaperCapturePdf({root:studioMaterialRoot(),group:snapshot.group,history:snapshot.history,retained:snapshot.retained,files:snapshot.receipts,signal});pdfPrepared(pdf.receipt.pdfSha256);
   const staged=await this.commands.transaction(async()=>{
    const work=current();this.files.check(snapshot.stages);const stages=await this.files.reserve([{role:'pdf',sha256:pdf.receipt.pdfSha256,bytes:pdf.bytes.length,mediaType:'application/pdf'}]),studio=assertStudioAssetAvailable(this.store,pdf.receipt.pdfSha256);work.activation.fileIds=stages.map(stage=>stage.id);return{stages,studioGeneration:studio.generation};
   },checkpoint('writing_pdf',{fileIds:[paperCaptureFileId('pdf',pdf.receipt.pdfSha256)],pdfSha256:pdf.receipt.pdfSha256}));
   await this.files.leased(staged.stages,()=>withStudioFileLease(studioMaterialRoot(),'source',pdf.receipt.pdfSha256,async()=>{
    const check=()=>{const work=current();this.files.check([...snapshot.stages,...staged.stages]);const asset=this.store.find('studioMaterialAssets',{id:pdf.receipt.pdfSha256,state:'available'});if(!asset||asset.generation!==staged.studioGeneration)throw new ConflictException('派生资料原件的存储代次已变化。');return work;};
    const progress={fileIds:staged.stages.map(stage=>stage.id),pdfSha256:pdf.receipt.pdfSha256};await this.commands.transaction(check,checkpoint('writing_pdf',progress));
    const paper=resolve(studioMaterialRoot(),'paper-images/pdf',pdf.receipt.pdfSha256+'.pdf'),studio=studioMaterialFile(pdf.receipt.pdfSha256),working=resolve(studioMaterialRoot(),'paper-images/working',staged.stages[0].id);
    for(const path of [paper,studio,working])await assertNoFileLinks(path);await writeAtomicImmutableBytes(paper,pdf.bytes,working);await verifyImmutableFile(paper,pdf.receipt.pdfSha256,pdf.bytes.length);await writeAtomicImmutableBytes(studio,pdf.bytes,working);await verifyImmutableFile(studio,pdf.receipt.pdfSha256,pdf.bytes.length);
    const at=new Date().toISOString(),materialId=this.store.nextId('studio_material'),processingTaskId=this.store.nextId('task');
    await this.commands.transaction(async()=>{
     const work=check();work.row.pdf=structuredClone(pdf.receipt);work.row.materialId=materialId;work.row.publishedAt=at;work.row.publishedGeneration=task.generation;assertPaperCaptureDerivation(work.row,work.version);
     const material:StudioMaterialRecord={id:materialId,ownerUserId:work.owner.id,studentId:work.row.attribution.scope.studentId,subject:work.row.attribution.scope.subject,kind:'pdf',filename:work.version.title.slice(0,176)+'.pdf',title:work.version.title,pageCount:pdf.receipt.pages.length,pages:[],sha256:pdf.receipt.pdfSha256,byteSize:pdf.bytes.length,hasPageImages:false,status:'queued',processingTaskId,error:null,createdAt:at,updatedAt:at,processingPages:[],paperCaptureOrigin:paperCaptureMaterialOrigin(work.row,work.version),...(work.activation.authorization?.learningAccess?{processingAccess:structuredClone(work.activation.authorization.learningAccess)}:{})};
     this.store.append('studioSourceMaterials',material);const payload={materialId,sha256:material.sha256};await this.store.enqueueTask({id:processingTaskId,kind:'studio.material.process',ownerUserId:work.owner.id,requestKey:'paper-derive:'+work.row.id,payloadHash:retentionDigest(payload),payload,createdAt:at,maxAttempts:2});
    },{id:task.id,token:task.leaseToken!,result:{derivationId:id,materialId,processingTaskId,pdfSha256:pdf.receipt.pdfSha256,groupId:snapshot.group.groupId,groupRevision:snapshot.group.revision,groupFingerprint:snapshot.group.fingerprint,publicationGeneration:task.generation}});
   }));
  });
 }
}
