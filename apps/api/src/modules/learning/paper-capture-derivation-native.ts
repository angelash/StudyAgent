import type {PrivacyReceipt} from '@study-agent/contracts';
import type {TaskRow} from '../../infrastructure/task-repository';
import {retentionDigest} from '../diagnostics/retention-anchor';
import {sourceDigest} from './source-course-content';
import {assertPaperCaptureAttribution} from './paper-capture-attribution';
import {assertPaperCaptureDerivation,assertPaperCaptureMaterialOrigin,paperCaptureDerivationKind,paperCaptureDerivationPayload,type PaperCaptureDerivationRecord} from './paper-capture-derivation-record';
import type {PaperCaptureGroupRecord} from './paper-capture-group-record';
import type {CommittedPaperCaptureCommandRecord,PaperCaptureFileAsset} from './paper-capture-record';
import {paperCaptureRetainedSourceMatches} from './paper-capture-retention-proof';

const same=(left:unknown,right:unknown)=>retentionDigest(left)===retentionDigest(right);
const fail=():never=>{throw Error('paper_capture_original_derivation_relation_changed');};
const decode=(value:unknown)=>typeof value==='string'?JSON.parse(value):value;
/** Accept actual SQL rows as well as TaskRepository projections. No task is
 * reconstructed from a source record or a public completion receipt. */
export function paperCaptureNativeTasks(values:readonly unknown[],relatedProcessingTaskIds:ReadonlySet<string>=new Set()):TaskRow[]{
 // Ordinary historical OCR tasks retain their original protocol. Paper source
 // validation owns only the actual processing tasks linked to its derivations.
 return values.filter(value=>(value as Record<string,unknown>|null)?.kind!=='studio.material.process'||relatedProcessingTaskIds.has(String((value as Record<string,unknown>).id))).map(value=>{
  const input=value as Record<string,any>;
  if(!input||typeof input!=='object')return fail();
  const task=('owner_id'in input?{id:input.id,kind:input.kind,ownerUserId:input.owner_id,requestKey:input.request_key,payloadHash:input.payload_hash,payload:decode(input.payload),state:input.state,attempts:input.attempts,maxAttempts:input.max_attempts,generation:input.generation,version:input.version,availableAt:Number(input.available_at),leaseToken:input.lease_token,leaseUntil:input.lease_until===null?null:Number(input.lease_until),progress:decode(input.progress),result:decode(input.result),errorCode:input.error_code,createdAt:input.created_at,updatedAt:input.updated_at}:input)as TaskRow;
  if(![task.id,task.kind,task.ownerUserId,task.requestKey].every(value=>typeof value==='string'&&value.length>0)||!/^[a-f0-9]{64}$/.test(task.payloadHash)||!task.payload||typeof task.payload!=='object'||Array.isArray(task.payload)||task.payloadHash!==retentionDigest(task.payload)&&task.payloadHash!==sourceDigest(task.payload)||!['queued','running','retry_wait','cancel_requested','cancelled','succeeded','failed'].includes(task.state)||!Number.isSafeInteger(task.generation)||task.generation<1||!Number.isSafeInteger(task.version)||task.version<1||!Number.isFinite(Date.parse(task.createdAt))||Date.parse(task.updatedAt)<Date.parse(task.createdAt))return fail();
  return task;
 });
}

/** Called on cold start and consistent backup/restore snapshots. Live domain
 * writes still use the existing SQL dependencies and completion fence. */
export function assertPaperCaptureDerivationRelations(state:Record<string,any[]>,taskValues:readonly unknown[],checkFile:(file:{role:PaperCaptureFileAsset['role'];sha256:string;bytes:number;mediaType:string})=>void){
 const rows=(state.paperCaptureDerivations??[])as PaperCaptureDerivationRecord[],groups=(state.paperCaptureGroups??[])as PaperCaptureGroupRecord[],commands=(state.paperCaptureCommands??[]).filter(row=>row.status==='committed')as CommittedPaperCaptureCommandRecord[],materials=state.studioSourceMaterials??[],users=state.users??[],receipts=(state.privacyRequests??[])as PrivacyReceipt[];
 const derivationTaskIds=new Set(rows.map(row=>row.taskId)),processingTaskIds=new Set<string>();
 for(const material of materials)if(material.paperCaptureOrigin&&typeof material.processingTaskId==='string')processingTaskIds.add(material.processingTaskId);
 for(const value of taskValues){const task=value as Record<string,any>;if(task&&derivationTaskIds.has(task.id)){const result=decode(task.result);if(result&&typeof result.processingTaskId==='string')processingTaskIds.add(result.processingTaskId);}}
 const tasks=paperCaptureNativeTasks(taskValues,processingTaskIds);
 const taskById=new Map(tasks.map(task=>[task.id,task]));
 if(taskById.size!==tasks.length||new Set(rows.map(row=>row.id)).size!==rows.length||new Set(rows.map(row=>row.taskId)).size!==rows.length||new Set(rows.filter(row=>row.materialId).map(row=>row.materialId)).size!==rows.filter(row=>row.materialId).length)fail();
 const derivationById=new Map(rows.map(row=>[row.id,row]));
 for(const row of rows){
  const group=groups.find(group=>group.id===row.groupId),saved=group?.history.find(saved=>saved.version.revision===row.groupRevision),task=taskById.get(row.taskId);
  if(!saved||Date.parse(saved.at)>Date.parse(row.createdAt)||!task)fail();assertPaperCaptureDerivation(row,saved!.version);assertPaperCaptureAttribution(row.attribution,users,receipts);
  if(task!.kind!==paperCaptureDerivationKind||task!.requestKey!=='paper-derive:'+row.id||!same(task!.payload,paperCaptureDerivationPayload(row))||task!.createdAt!==row.createdAt||retentionDigest({id:task!.ownerUserId})!==row.attribution.scope.creatorFingerprint)fail();
  const originals=commands.filter(command=>command.input.kind==='recognize'&&command.result.derivationId===row.id),controls=commands.filter(command=>['cancelDerivation','retryDerivation'].includes(command.input.kind)&&command.result.derivationId===row.id);
  if(row.attribution.ownerUserId===null){
   // Closing an actual running author task first requests cancellation. Its
   // original completion fence already forbids publishing during this state.
   if(originals.length||controls.length||!receipts.some(receipt=>receipt.kind==='account_delete'&&receipt.subjectHash===row.attribution.ownerDeletionHash&&Date.parse(receipt.completedAt)>=Date.parse(row.publishedAt??row.createdAt)&&paperCaptureRetainedSourceMatches('paperCaptureDerivations',row,receipt))||!row.pdf&&!['cancel_requested','cancelled','failed'].includes(task!.state))fail();
  }else{
   if(task!.ownerUserId!==row.attribution.ownerUserId||originals.length!==1)fail();
   const original=originals[0];
   if(original.input.kind!=='recognize'||original.input.groupId!==row.groupId||original.input.input.expectedRevision!==row.groupRevision||original.input.input.expectedFingerprint!==row.groupFingerprint||original.at!==row.createdAt||!same(original.result,{kind:'recognize',derivationId:row.id,groupId:row.groupId,groupRevision:row.groupRevision,groupFingerprint:row.groupFingerprint,taskId:row.taskId,taskVersion:1,taskGeneration:1,createdAt:row.createdAt}))fail();
   const activations=[original,...controls.filter(command=>command.input.kind==='retryDerivation')],generations=activations.map(command=>Number(command.result.taskGeneration)),latest=Math.max(...generations);
   if(new Set(generations).size!==generations.length||latest>task!.generation||latest!==task!.generation&&!(task!.state==='cancelled'&&task!.errorCode==='restored_paper_capture_fence'&&latest+1===task!.generation))fail();
   for(const command of [original,...controls]){
    if(command.actorId!==row.attribution.ownerUserId||!same(command.scope,row.attribution.scope)||!command.authorization||Date.parse(command.at)<Date.parse(row.createdAt))fail();
    if(command.authorization!.guardianDeletionHash&&!receipts.some(receipt=>receipt.kind==='account_delete'&&receipt.subjectHash===command.authorization!.guardianDeletionHash&&retentionDigest({id:receipt.actorId})===receipt.subjectHash&&receipt.retainedStudentHashes?.includes(retentionDigest({id:row.attribution.scope.studentId}))&&Date.parse(receipt.completedAt)>=Date.parse(command.at)))fail();
    if(command.input.kind==='recognize')continue;
    if(command.input.kind!=='cancelDerivation'&&command.input.kind!=='retryDerivation')fail();
    const input=command.input as Extract<typeof command.input,{kind:'cancelDerivation'|'retryDerivation'}>,retry=input.kind==='retryDerivation',version=Number(command.result.taskVersion),generation=input.input.expectedGeneration+Number(retry);
    if(input.groupId!==row.groupId||input.derivationId!==row.id||!Number.isSafeInteger(version)||version!==input.input.expectedTaskVersion+1&&!(input.kind==='cancelDerivation'&&version===input.input.expectedTaskVersion)||version>task!.version||generation>task!.generation||!same(command.result,{kind:input.kind,derivationId:row.id,groupId:row.groupId,taskId:row.taskId,taskVersion:version,taskGeneration:generation,acceptedAt:command.at}))fail();
   }
  }
  if(!row.pdf){if(task!.state==='succeeded'||task!.result!==null)fail();continue;}
  const material=materials.find(material=>material.id===row.materialId);
  if(!material||task!.state!=='succeeded'||task!.generation!==row.publishedGeneration||material.kind!=='pdf'||material.sha256!==row.pdf.pdfSha256||material.byteSize!==row.pdf.pdfBytes||material.studentId!==row.attribution.scope.studentId||material.subject!==row.attribution.scope.subject||material.createdAt!==row.publishedAt||row.attribution.ownerUserId!==null&&material.ownerUserId!==row.attribution.ownerUserId||row.attribution.ownerUserId===null&&material.ownerUserId!=='deleted-account')fail();
  assertPaperCaptureMaterialOrigin(material.paperCaptureOrigin,row,saved!.version);checkFile({role:'pdf',sha256:row.pdf.pdfSha256,bytes:row.pdf.pdfBytes,mediaType:'application/pdf'});
  const result={derivationId:row.id,materialId:material.id,processingTaskId:task!.result?.processingTaskId,pdfSha256:row.pdf.pdfSha256,groupId:row.groupId,groupRevision:row.groupRevision,groupFingerprint:row.groupFingerprint,publicationGeneration:row.publishedGeneration};
  if(!same(task!.result,result)||typeof result.processingTaskId!=='string')fail();
  const initialProcessing=taskById.get(String(result.processingTaskId)),processing=taskById.get(String(material.processingTaskId));
  for(const actual of [initialProcessing,processing])if(!actual||actual.kind!=='studio.material.process'||!same(actual.payload,{materialId:material.id,sha256:material.sha256}))fail();
  if(retentionDigest({id:initialProcessing!.ownerUserId})!==row.attribution.scope.creatorFingerprint||initialProcessing!.requestKey!=='paper-derive:'+row.id||initialProcessing!.createdAt!==row.publishedAt)fail();
  // A current guardian may explicitly retry OCR of a retained shared source.
  // The original derivation task and immutable PDF origin remain unchanged.
  if(processing!.id!==initialProcessing!.id&&!material.commands?.some((command:{key:string;kind:string})=>command.kind==='retry'&&command.key===processing!.requestKey))fail();
 }
 for(const command of commands)if(['recognize','cancelDerivation','retryDerivation'].includes(command.input.kind)&&!derivationById.has(String(command.result.derivationId)))fail();
 for(const material of materials)if(material.paperCaptureOrigin){const row=derivationById.get(material.paperCaptureOrigin.derivationId);if(!row||row.materialId!==material.id)fail();}
 for(const task of tasks)if(task.kind===paperCaptureDerivationKind&&!derivationById.has(String(task.payload.derivationId))&&!['succeeded','failed','cancelled'].includes(task.state))fail();
}
