import {ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {paperCaptureFileReportSchema,type PaperCaptureFileReport,type PaperCaptureFileCheck,type PaperCaptureFileTarget,type PaperCaptureScope,type PaperCaptureRepairSelection} from '@study-agent/contracts';
import {InMemoryStoreService,type InMemoryUserAccount,type InMemoryAuthSession} from '../../infrastructure/in-memory-store.service';
import {withStudioFileLease} from '../../infrastructure/studio-file-coordination';
import {validate} from '../../common/validation';
import {retentionDigest} from '../diagnostics/retention-anchor';
import {PaperCaptureCommandService} from './paper-capture-command.service';
import {PaperCaptureFileService} from './paper-capture-file.service';
import {paperCaptureFileId} from './paper-capture-record';
import {assertPaperCapturePage} from './paper-capture-page';
import {assertPaperCaptureGroupRecord,retainedPaperCapturePage} from './paper-capture-group-record';
import {assertPaperCaptureDerivation} from './paper-capture-derivation-record';
import {paperImageFilePath,verifyPaperImageFileSet} from './paper-capture-files';
import {verifyPaperCapturePdf} from './paper-capture-derived-pdf';
import {observePaperCaptureFile,recheckPaperCaptureObservation,readExactPaperCaptureBytes,PaperFileObservationChanged,type PaperFileObservation} from './paper-capture-file-observation';
import {paperCaptureRepairCandidateRequestSchema,paperCaptureRepairCandidateSchema,type PaperCaptureRepairCandidate} from '@study-agent/contracts';
import {renderPaperCaptureImage} from './paper-capture-image';
import {paperImageFilesReceipt} from './paper-capture-files';
import {derivePaperCapturePdf} from './paper-capture-derived-pdf';
import {bytesDigest} from '../../infrastructure/immutable-files';
import {studioMaterialRoot,studioMaterialFile} from './studio-material-storage';

export type PaperIntegrityAsset={id:string;generation:number;state:PaperCaptureFileCheck['assetState'];kind:'paper'|'studio'};
type Asset=PaperIntegrityAsset;
export type PaperIntegrityFile={role:PaperCaptureFileCheck['role'];sha256:string;bytes:number;mediaType:PaperCaptureFileCheck['mediaType'];path:string;asset:Asset};
type File=PaperIntegrityFile;
export type PaperIntegritySnapshot={target:PaperCaptureFileTarget;scope:PaperCaptureScope;sourceFingerprint:string;files:File[];assets:Asset[];verify:()=>Promise<unknown>};
type Snapshot=PaperIntegritySnapshot;
const changed=()=>new ConflictException({code:'paper_capture_file_check_changed',message:'原页、文件或授权在核对期间已变化，请保留当前输入后重新核对。'});

@Injectable()
export class PaperCaptureIntegrityService{
 constructor(private readonly store:InMemoryStoreService,private readonly commands:PaperCaptureCommandService,private readonly files:PaperCaptureFileService){}
 private reader(user:InMemoryUserAccount,scope:PaperCaptureScope,session:InMemoryAuthSession){
  const actual=this.commands.audience(user,scope),login=this.store.find('sessions',{id:session.id,userId:user.id,revokedAt:null});
  if((actual.version??0)!==(user.version??0)||!login||Date.parse(login.expiresAt)<=Date.now()||login.guardianId!==session.guardianId||login.accessVersion!==session.accessVersion)throw new ForbiddenException('原核对请求的登录授权已变化，请重新登录后核对。');
  if(actual.role==='student'){const guardian=login.guardianId&&this.store.find('users',{id:login.guardianId,status:'active',role:['parent','admin']});if(!guardian||!this.store.find('studentLearningAccess',{studentId:scope.studentId,userId:user.id,status:'enabled',version:login.accessVersion})||guardian.role!=='admin'&&!this.store.find('bindings',{studentId:scope.studentId,parentUserId:guardian.id,status:'active'}))throw new ForbiddenException('原核对请求的学习授权已变化，请重新确认。');}
 }
 private paperAsset(file:{role:'original'|'baseline'|'derived'|'pdf';sha256:string;bytes:number;mediaType:string}):Asset{
  const id=paperCaptureFileId(file.role,file.sha256),asset=this.store.find('paperCaptureFileAssets',{id});
  if(!asset||asset.sha256!==file.sha256||asset.bytes!==file.bytes||asset.mediaType!==file.mediaType||!Number.isSafeInteger(asset.generation)||asset.generation<1)throw changed();
  return{id,generation:asset.generation,state:asset.state,kind:'paper'};
 }
 private pageSnapshot(user:InMemoryUserAccount,id:string,version:string):Snapshot{
  const row=this.store.find('paperCapturePages',{id});if(!row)throw new NotFoundException('原页不存在。');this.commands.audience(user,row.attribution.scope);const page=assertPaperCapturePage(row),selected=page.versions.find(value=>value.receipt.version.fingerprint===version);if(!selected)throw new NotFoundException('这个原页处理版本不存在。');
  const receipt=structuredClone(selected.receipt),target={kind:'page' as const,pageId:id,versionFingerprint:version},scope=structuredClone(page.attribution.scope),files=receipt.files.map(file=>({...file,path:paperImageFilePath(studioMaterialRoot(),file),asset:this.paperAsset(file)}));
  return{target,scope,files,assets:files.map(file=>file.asset),sourceFingerprint:retentionDigest({target,scope,receipt}),verify:()=>verifyPaperImageFileSet(studioMaterialRoot(),receipt)};
 }
 private derivationSnapshot(user:InMemoryUserAccount,id:string):Snapshot{
  const row=this.store.find('paperCaptureDerivations',{id});if(!row)throw new NotFoundException('原图片识别任务不存在。');this.commands.audience(user,row.attribution.scope);if(!row.pdf||!row.materialId)throw new ConflictException('这次派生PDF尚未完成，请先查看识别进度。');
  const group=this.store.find('paperCaptureGroups',{id:row.groupId});if(!group)throw changed();const pageIds=[...new Set(group.history.flatMap(saved=>saved.version.pages.map(page=>page.pageId)))],pages=this.store.select('paperCapturePages',{id:pageIds});assertPaperCaptureGroupRecord(group,pages);const selected=group.history.find(saved=>saved.version.revision===row.groupRevision)?.version;if(!selected)throw changed();assertPaperCaptureDerivation(row,selected);
  const pdf=structuredClone(row.pdf),scope=structuredClone(row.attribution.scope),target={kind:'derivation' as const,derivationId:id,pdfFingerprint:pdf.fingerprint},material=this.store.find('studioSourceMaterials',{id:row.materialId}),studio=this.store.find('studioMaterialAssets',{id:pdf.pdfSha256});
  if(!material||material.kind!=='pdf'||material.sha256!==pdf.pdfSha256||material.byteSize!==pdf.pdfBytes||material.paperCaptureOrigin?.derivationId!==id||!studio||!Number.isSafeInteger(studio.generation)||studio.generation<1)throw changed();
  const paper=this.paperAsset({role:'pdf',sha256:pdf.pdfSha256,bytes:pdf.pdfBytes,mediaType:'application/pdf'}),studioAsset:Asset={id:studio.id,generation:studio.generation,state:studio.state,kind:'studio'},files:File[]=[{role:'pdf',sha256:pdf.pdfSha256,bytes:pdf.pdfBytes,mediaType:'application/pdf',path:resolve(studioMaterialRoot(),'paper-images/pdf',pdf.pdfSha256+'.pdf'),asset:paper},{role:'material_pdf',sha256:pdf.pdfSha256,bytes:pdf.pdfBytes,mediaType:'application/pdf',path:studioMaterialFile(pdf.pdfSha256),asset:studioAsset}];
  const receipts=selected.pages.map(reference=>{const page=pages.find(page=>page.id===reference.pageId),version=page?.versions.find(version=>version.receipt.version.fingerprint===reference.versionFingerprint);if(!version)throw changed();return structuredClone(version.receipt);}),assets=new Map(files.map(file=>[file.asset.kind+':'+file.asset.id,file.asset]));for(const receipt of receipts)for(const file of receipt.files){const asset=this.paperAsset(file);assets.set('paper:'+asset.id,asset);}
  const input={root:studioMaterialRoot(),group:structuredClone(selected),history:structuredClone(group.history.slice(0,row.groupRevision-1).map(saved=>saved.version)),retained:pages.map(retainedPaperCapturePage),files:receipts};
  return{target,scope,files,assets:[...assets.values()],sourceFingerprint:retentionDigest({target,scope,pdf,group:selected,materialId:material.id,origin:material.paperCaptureOrigin}),verify:async()=>verifyPaperCapturePdf(input,await readFile(files[0].path),pdf)};
 }
 async page(user:InMemoryUserAccount,id:string,value:unknown,session:InMemoryAuthSession){const query=validate(z.object({version:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),value);return this.inspect(user,()=>this.pageSnapshot(user,id,query.version),session);}
 async derivation(user:InMemoryUserAccount,id:string,session:InMemoryAuthSession){return this.inspect(user,()=>this.derivationSnapshot(user,id),session);}
 resolveTarget(user:InMemoryUserAccount,target:PaperCaptureFileTarget):Snapshot{const value=target.kind==='page'?this.pageSnapshot(user,target.pageId,target.versionFingerprint):this.derivationSnapshot(user,target.derivationId);if(retentionDigest(value.target)!==retentionDigest(target))throw changed();return value;}
 /** Read-only exact candidates retain their real source. Creation performs no
  * upload, material publication or repair reservation. A later upload must
  * regenerate and verify this provenance under current authorization. */
 async repairCandidate(user:InMemoryUserAccount,value:unknown,session:InMemoryAuthSession):Promise<{bytes:Buffer;candidate:PaperCaptureRepairCandidate}>{
  const input=validate(paperCaptureRepairCandidateRequestSchema,value),selection=input.selection;
  if(selection.target.kind==='page'&&(input.strategy!=='source_rebuild'||selection.role==='original'))throw new ConflictException('原图缺失时需要相同准确原文件；处理版本可从完整原图重建。');
  return this.repairPreflight(user,selection,session,async({snapshot,file,check})=>{
   const authorize=()=>{check();this.commands.authorizeSession(user,this.commands.scope(user,snapshot.scope.studentId,snapshot.scope.subject),session);};
   await this.store.requestContext(authorize);
   const seal=async(bytes:Buffer,basis:PaperCaptureRepairCandidate['basis'])=>{
    if(bytes.length!==selection.bytes||bytesDigest(bytes)!==selection.sha256)throw new ConflictException('当前处理器不能重建相同历史字节，请保留原来源并使用准确原文件或核对处理器版本。');
    await this.store.requestContext(authorize);const body={protocol:'paper-capture-repair-candidate-v1' as const,selection:structuredClone(selection),strategy:input.strategy,basis};return{bytes,candidate:paperCaptureRepairCandidateSchema.parse({...body,fingerprint:retentionDigest(body)})};
   };
   const withSources=async<T>(assets:Asset[],body:()=>Promise<T>)=>{
    const unique=[...new Map(assets.map(asset=>[asset.kind+':'+asset.id,asset])).values()].sort((a,b)=>(a.kind+':'+a.id).localeCompare(b.kind+':'+b.id));
    const checkSources=()=>{authorize();for(const asset of unique){const row=asset.kind==='paper'?this.store.find('paperCaptureFileAssets',{id:asset.id}):this.store.find('studioMaterialAssets',{id:asset.id});if(!row||row.state!=='available'||row.generation!==asset.generation)throw changed();}};
    const read=async()=>{await this.store.requestContext(checkSources);const result=await body();await this.store.requestContext(checkSources);return result;};
    const paper=unique.filter(asset=>asset.kind==='paper'&&!(file.asset.kind==='paper'&&file.asset.id===asset.id)).map(asset=>({id:asset.id,generation:asset.generation})),studio=unique.filter(asset=>asset.kind==='studio'&&!(file.asset.kind==='studio'&&file.asset.id===asset.id));
    const enter=(index:number):Promise<T>=>index===studio.length?this.files.leased(paper,read):withStudioFileLease(studioMaterialRoot(),'source',studio[index].id,()=>enter(index+1));return enter(0);
   };
   if(input.strategy==='other_pdf'){
    const other=snapshot.files.find(source=>source.role===(selection.role==='pdf'?'material_pdf':'pdf'));if(!other||selection.target.kind!=='derivation')throw changed();
    return withSources([other.asset],async()=>seal(await readExactPaperCaptureBytes(other.path,other),{kind:'pdf',role:other.role as 'pdf'|'material_pdf',sha256:other.sha256,bytes:other.bytes,pdfFingerprint:selection.target.kind==='derivation'?selection.target.pdfFingerprint:''}));
   }
   if(selection.target.kind==='page'){
    const target=selection.target,saved=await this.store.requestContext(()=>{authorize();const page=this.store.find('paperCapturePages',{id:target.pageId});if(!page)throw changed();assertPaperCapturePage(page);const receipt=page.versions.find(row=>row.receipt.version.fingerprint===target.versionFingerprint)?.receipt;if(!receipt)throw changed();return structuredClone(receipt);}),original=saved.files.find(source=>source.role==='original')!,asset=await this.store.requestContext(()=>this.paperAsset(original));
    return withSources([asset],async()=>{const bytes=await readExactPaperCaptureBytes(paperImageFilePath(studioMaterialRoot(),original),original,12*1024*1024),rebuilt=await renderPaperCaptureImage(bytes,saved.source.originalMediaType,saved.source.originalSha256,saved.source.pageId,saved.version.transform);
     if(rebuilt.receipt.renderer!==saved.renderer||retentionDigest(paperImageFilesReceipt(bytes,rebuilt))!==retentionDigest(saved))throw new ConflictException('原处理器或历史变换需要核对，未用新字节替换旧处理版本。');
     return seal(selection.role==='baseline'?rebuilt.baselineBytes:rebuilt.bytes,{kind:'page',pageId:target.pageId,versionFingerprint:target.versionFingerprint,originalSha256:saved.source.originalSha256,originalBytes:saved.source.originalBytes,originalMediaType:saved.source.originalMediaType,renderer:saved.renderer});
    });
   }
   const target=selection.target,plan=await this.store.requestContext(()=>{authorize();const row=this.store.find('paperCaptureDerivations',{id:target.derivationId}),group=row&&this.store.find('paperCaptureGroups',{id:row.groupId});if(!row?.pdf||!group)throw changed();
    const pages=this.store.select('paperCapturePages',{id:[...new Set(group.history.flatMap(saved=>saved.version.pages.map(page=>page.pageId)))]});assertPaperCaptureGroupRecord(group,pages);const selected=group.history.find(saved=>saved.version.revision===row.groupRevision)?.version;if(!selected)throw changed();assertPaperCaptureDerivation(row,selected);
    const receipts=selected.pages.map(reference=>{const receipt=pages.find(page=>page.id===reference.pageId)?.versions.find(saved=>saved.receipt.version.fingerprint===reference.versionFingerprint)?.receipt;if(!receipt)throw changed();return structuredClone(receipt);}),assets=receipts.flatMap(receipt=>receipt.files.map(file=>this.paperAsset(file)));
    return{input:{root:studioMaterialRoot(),group:structuredClone(selected),history:structuredClone(group.history.slice(0,row.groupRevision-1).map(saved=>saved.version)),retained:pages.map(retainedPaperCapturePage),files:receipts},assets,pdf:structuredClone(row.pdf)};
   });
   return withSources(plan.assets,async()=>{const rebuilt=await derivePaperCapturePdf(plan.input);if(retentionDigest(rebuilt.receipt)!==retentionDigest(plan.pdf))throw new ConflictException('原冻结组或PDF处理器需要核对，未创建替代来源。');return seal(rebuilt.bytes,{kind:'group',groupId:plan.input.group.groupId,revision:plan.input.group.revision,fingerprint:plan.input.group.fingerprint,pdfFingerprint:plan.pdf.fingerprint,renderer:plan.pdf.renderer});});
  });
 }
 /** The callback commits while this exact target is leased. It must call check
  * in its actual write transaction before reserving a repairing generation. */
 async repairPreflight<T>(user:InMemoryUserAccount,selection:PaperCaptureRepairSelection,session:InMemoryAuthSession,body:(input:{snapshot:Snapshot;file:File;baseline:Exclude<PaperFileObservation,{kind:'unavailable'}>;check:()=>{snapshot:Snapshot;file:File}})=>Promise<T>):Promise<T>{
  const check=()=>{const snapshot=this.resolveTarget(user,selection.target);this.reader(user,snapshot.scope,session);const file=snapshot.files.find(file=>file.role===selection.role);if(!file||snapshot.sourceFingerprint!==selection.sourceFingerprint||file.sha256!==selection.sha256||file.bytes!==selection.bytes||file.mediaType!==selection.mediaType||file.asset.state!=='available'||file.asset.generation!==selection.assetGeneration)throw changed();return{snapshot,file};};
  const initial=await this.store.requestContext(check),read=async()=>{await this.store.requestContext(check);const baseline=await observePaperCaptureFile(initial.file.path);if(baseline.kind==='unavailable'||retentionDigest({asset:initial.file.asset,observation:baseline})!==selection.observationFingerprint||baseline.kind==='regular'&&baseline.sha256===selection.sha256&&baseline.size===selection.bytes)throw changed();await recheckPaperCaptureObservation(initial.file.path,baseline);return body({...initial,baseline,check});};
  try{return initial.file.asset.kind==='paper'?await this.files.leased([{id:initial.file.asset.id,generation:initial.file.asset.generation}],read):await withStudioFileLease(studioMaterialRoot(),'source',initial.file.asset.id,read);}catch(error){if(error instanceof PaperFileObservationChanged)throw changed();throw error;}
 }
 private async inspect(user:InMemoryUserAccount,snapshot:()=>Snapshot,session:InMemoryAuthSession):Promise<PaperCaptureFileReport>{
  const frozen=await this.store.requestContext(()=>{const value=snapshot();this.reader(user,value.scope,session);return value;}),assets=[...frozen.assets].sort((a,b)=>(a.kind+':'+a.id).localeCompare(b.kind+':'+b.id)),stages=assets.filter(asset=>asset.kind==='paper'&&asset.state==='available').map(asset=>({id:asset.id,generation:asset.generation})),source=assets.find(asset=>asset.kind==='studio'&&asset.state==='available');
  const check=()=>{const current=snapshot();this.reader(user,current.scope,session);if(current.sourceFingerprint!==frozen.sourceFingerprint||retentionDigest([...current.assets].sort((a,b)=>(a.kind+':'+a.id).localeCompare(b.kind+':'+b.id)))!==retentionDigest(assets))throw changed();};
  const read=async()=>{
   await this.store.requestContext(check);const observations:Array<{file:File;observation:PaperFileObservation}>=[],files:PaperCaptureFileCheck[]=[];
   for(const file of frozen.files){
    const observation=file.asset.state==='available'?await observePaperCaptureFile(file.path):{kind:'unavailable' as const};observations.push({file,observation});
    files.push({role:file.role,sha256:file.sha256,bytes:file.bytes,mediaType:file.mediaType,assetGeneration:file.asset.generation,assetState:file.asset.state,status:file.asset.state==='repairing'||file.asset.state==='deleting'?'busy':file.asset.state!=='available'?'unavailable':observation.kind==='missing'?'missing':observation.kind==='unavailable'?'unavailable':observation.sha256===file.sha256&&observation.size===file.bytes?'verified':'changed',actualSha256:observation.kind==='regular'?observation.sha256:null,actualBytes:observation.kind==='regular'?observation.size:null,observationFingerprint:retentionDigest({asset:file.asset,observation})});
   }
   let relation:PaperCaptureFileReport['relation']='unavailable',relationCode:PaperCaptureFileReport['relationCode']='source_files_unavailable';
   if(files.every(file=>file.status==='verified')&&assets.every(asset=>asset.state==='available'))try{await frozen.verify();relation='verified';relationCode=null;}catch(error){const message=error instanceof Error?error.message:'';if(message==='paper_image_renderer_version_requires_review'){relation='review_required';relationCode='renderer_review_required';}else if(['paper_image_actual_transform_integrity_failed','paper_pdf_actual_source_mapping_mismatch','paper_pdf_original_mapping_mismatch'].includes(message)){relation='changed';relationCode='source_mapping_changed';}}
   for(const {file,observation}of observations)if(file.asset.state==='available')await recheckPaperCaptureObservation(file.path,observation);
   const canRestore=await this.store.requestContext(()=>{check();try{const scope=this.commands.scope(user,frozen.scope.studentId,frozen.scope.subject);this.commands.writer(user,scope);return files.some(file=>['missing','changed'].includes(file.status));}catch{return false;}});
   const body={protocol:'paper-capture-file-report-v1' as const,target:frozen.target,scope:frozen.scope,sourceFingerprint:frozen.sourceFingerprint,files,relation,relationCode,canRestore};return paperCaptureFileReportSchema.parse({...body,checkedAt:new Date().toISOString(),fingerprint:retentionDigest(body)});
  };
  try{return await this.files.leased(stages,()=>source?withStudioFileLease(studioMaterialRoot(),'source',source.id,read):read());}catch(error){if(error instanceof PaperFileObservationChanged)throw changed();throw error;}
 }
}
