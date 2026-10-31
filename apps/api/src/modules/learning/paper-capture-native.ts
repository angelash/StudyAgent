import type {PrivacyReceipt} from '@study-agent/contracts';
import {retentionDigest} from '../diagnostics/retention-anchor';
import {assertPaperCaptureAttribution} from './paper-capture-attribution';
import {assertPaperCapturePage,type PaperCapturePageRecord} from './paper-capture-page';
import {paperImageVersion} from './paper-capture-image';
import {assertPaperCaptureGroupRecord} from './paper-capture-group-record';
import {preparePaperCaptureGroup} from './paper-capture-group';
import {paperCaptureRetainedSourceMatches} from './paper-capture-retention-proof';
import {assertPaperCaptureDerivationRelations} from './paper-capture-derivation-native';
import {assertPaperCaptureRepairRelations} from './paper-capture-repair-native';
import {assertPaperCaptureCommand,assertPaperImageUpload,paperCaptureFileAssetSchema,paperCaptureFileId,type PaperImageUploadRecord,type PaperCaptureCommandRecord,type CommittedPaperCaptureCommandRecord,type PaperCaptureFileAsset} from './paper-capture-record';

type Row={collection:string;record_id?:string;body:unknown};
const same=(left:unknown,right:unknown)=>retentionDigest(left)===retentionDigest(right);
function fail():never{throw Error('paper_capture_original_relation_changed');}
const unique=<T>(rows:readonly T[],key:(row:T)=>string)=>{if(new Set(rows.map(key)).size!==rows.length)fail();};
export const PAPER_CAPTURE_GROUP_NATIVE_READY=true;
export const PAPER_CAPTURE_DERIVATION_NATIVE_READY=true;

/** Every historical relation is reconstructed from actual retained records.
 * File bytes are independently checked/rebuilt by the file-integrity layer.
 * Derivations are also checked against the actual transactional task outbox.
 */
export function assertPaperCaptureNativeRows(rows:Row[],tasks:readonly unknown[]=[]){
 try{
  const state:Record<string,any[]>={};
  for(const row of rows){const body=typeof row.body==='string'?JSON.parse(row.body):row.body;if(!body||typeof body!=='object'||row.record_id!==undefined&&(body as any).id!==row.record_id)fail();(state[row.collection]??=[]).push(body);}
  const records=(name:string)=>state[name]??[];
  const uploads=records('paperImageUploads').map(row=>assertPaperImageUpload(row as PaperImageUploadRecord)),allCommands=records('paperCaptureCommands').map(row=>assertPaperCaptureCommand(row as PaperCaptureCommandRecord)),commands=allCommands.filter((row):row is CommittedPaperCaptureCommandRecord=>row.status==='committed'),pages=records('paperCapturePages').map(row=>assertPaperCapturePage(row as PaperCapturePageRecord));
  const assets=records('paperCaptureFileAssets').map(value=>{const row=paperCaptureFileAssetSchema.parse(value);if(!same(row,value)||row.id!==paperCaptureFileId(row.role,row.sha256)||Date.parse(row.updatedAt)<Date.parse(row.createdAt)||row.role==='pdf'&&row.mediaType!=='application/pdf'||row.role!=='pdf'&&row.mediaType==='application/pdf'||['baseline','derived'].includes(row.role)&&row.mediaType!=='image/png')fail();return row;});
  const groups=records('paperCaptureGroups').map(row=>assertPaperCaptureGroupRecord(row,pages)),derivations=records('paperCaptureDerivations');if(!PAPER_CAPTURE_GROUP_NATIVE_READY&&groups.length||!PAPER_CAPTURE_DERIVATION_NATIVE_READY&&derivations.length)throw Error('paper_capture_group_native_not_ready');
  unique(uploads,row=>row.id);unique(allCommands,row=>row.id);unique(pages,row=>row.id);unique(assets,row=>row.id);unique(groups,row=>row.id);
  unique(allCommands,row=>JSON.stringify([row.actorId,row.requestKey]));unique(uploads,row=>JSON.stringify([row.actorId,row.requestKey]));unique(uploads.filter(row=>row.status==='uploading'),row=>row.pageId);unique(assets,row=>JSON.stringify([row.role,row.sha256]));
  const users=records('users'),students=records('students'),receipts=records('privacyRequests')as PrivacyReceipt[],userIds=new Set(users.map(row=>row.id));
  const scope=(value:{creatorFingerprint:string;studentId:string|null;subject:string|null})=>{if(value.studentId&&!students.some(student=>student.id===value.studentId))fail();};
  const commandById=new Map(commands.map(row=>[row.id,row])),uploadById=new Map(uploads.map(row=>[row.id,row])),pageById=new Map(pages.map(row=>[row.id,row])),assetById=new Map(assets.map(row=>[row.id,row]));
  // A repairing asset is accepted only provisionally here. The repair-native
  // verifier below requires its actual immutable intent, command and task.
  const readable=(asset:PaperCaptureFileAsset)=>asset.state==='available'||asset.state==='repairing'&&Boolean(asset.paperCaptureRepair);
  const checkFile=(file:{role:string;sha256:string;bytes:number;mediaType:string},available=true)=>{const asset=assetById.get(paperCaptureFileId(file.role as PaperCaptureFileAsset['role'],file.sha256));if(!asset||asset.role!==file.role||asset.sha256!==file.sha256||asset.bytes!==file.bytes||asset.mediaType!==file.mediaType||available&&!readable(asset))fail();};
  for(const row of allCommands){
   scope(row.scope);if(!userIds.has(row.actorId))fail();
   for(const id of row.fileIds){const asset=assetById.get(id);if(!asset||row.status==='preparing'&&!readable(asset))fail();}
   if(row.status==='committed')continue;
   const input=row.input;
   if(input.kind==='completeUpload'||input.kind==='cancelUpload'){const upload=uploadById.get(input.uploadId);if(!upload||upload.actorId!==row.actorId||!same(upload.scope,row.scope))fail();}
   else if(input.kind==='pageRevision'){const page=pageById.get(input.pageId),previous=page?.adoptions.find(adoption=>adoption.revision===input.input.expectedRevision);if(!page||page.attribution.ownerUserId!==row.actorId||!same(page.attribution.scope,row.scope)||!previous||previous.versionFingerprint!==input.input.expectedVersionFingerprint)fail();}
   else throw Error('paper_capture_pending_kind_not_ready');
  }
  for(const upload of uploads){
   scope(upload.scope);if(!userIds.has(upload.actorId))fail();const creation=commandById.get(upload.commandId);
   if(!creation||creation.input.kind!=='upload'||creation.actorId!==upload.actorId||creation.at!==upload.createdAt||!same(creation.scope,upload.scope)||!same(creation.input.input,{protocol:'paper-image-upload-input-v1',scope:upload.scope,pageId:upload.pageId,name:upload.name,size:upload.size,sha256:upload.sha256,mediaType:upload.mediaType})||!same(creation.result,{kind:'upload',uploadId:upload.id,pageId:upload.pageId,chunkSize:upload.chunkSize,createdAt:upload.createdAt,expiresAt:upload.expiresAt}))fail();
   if(upload.preparedFileIds.length){const files=upload.preparedFileIds.map(id=>assetById.get(id));if(files.length!==3||files.some(file=>!file)||new Set(files.map(file=>file!.role)).size!==3||!files.some(file=>file!.role==='original'&&file!.sha256===upload.sha256&&file!.bytes===upload.size&&file!.mediaType===upload.mediaType)||files.some(file=>file!.role==='pdf'||upload.status==='uploading'&&!readable(file!)))fail();}
   if(upload.guardianDeletionHash){if(upload.learningAccess||!receipts.some(receipt=>receipt.kind==='account_delete'&&receipt.subjectHash===upload.guardianDeletionHash&&retentionDigest({id:receipt.actorId})===upload.guardianDeletionHash&&receipt.retainedStudentHashes?.includes(retentionDigest({id:upload.scope.studentId}))&&Date.parse(receipt.completedAt)>=Date.parse(upload.createdAt)))fail();}
   if(upload.status==='uploading')continue;
   const terminal=upload.terminalCommandId?commandById.get(upload.terminalCommandId):null;
   if(!terminal){if(!(upload.guardianDeletionHash||upload.systemClosure==='expired')||upload.status!=='cancelled')fail();continue;}
   if(terminal.actorId!==upload.actorId||!same(terminal.scope,upload.scope)||terminal.at!==upload.endedAt)fail();
   if(upload.status==='completed'){
    const page=pageById.get(upload.pageId);if(!page||terminal.input.kind!=='completeUpload'||terminal.input.uploadId!==upload.id||terminal.input.input.expectedRevision!==upload.chunks.length||page.attribution.ownerUserId!==upload.actorId||!same(page.attribution.scope,upload.scope)||page.attribution.createdAt!==upload.endedAt||page.filename!==upload.name||page.versions[0].receipt.source.originalSha256!==upload.sha256||page.versions[0].receipt.source.originalBytes!==upload.size||page.versions[0].receipt.source.originalMediaType!==upload.mediaType||!same(terminal.result,{kind:'completeUpload',uploadId:upload.id,pageId:upload.pageId,revision:1,versionFingerprint:page.adoptions[0].versionFingerprint,completedAt:upload.endedAt}))fail();
   }else if(terminal.input.kind==='cancelUpload'){
    if(terminal.input.uploadId!==upload.id||terminal.input.input.expectedRevision!==upload.chunks.length||!same(terminal.result,{kind:'cancelUpload',uploadId:upload.id,revision:upload.revision,cancelledAt:upload.endedAt}))fail();
   }else if(terminal.input.kind==='upload'){
    const next=uploads.find(next=>next.commandId===terminal.id);if(!next||next.pageId!==upload.pageId||next.id===upload.id||next.sha256!==upload.sha256||next.size!==upload.size||next.mediaType!==upload.mediaType||Date.parse(upload.expiresAt)>Date.parse(terminal.at))fail();
   }else fail();
  }
  for(const page of pages){
   scope(page.attribution.scope);assertPaperCaptureAttribution(page.attribution,users,receipts);
   for(const version of page.versions)for(const file of version.receipt.files)checkFile(file);
   if(page.attribution.ownerUserId===null){if(!receipts.some(receipt=>receipt.kind==='account_delete'&&receipt.subjectHash===page.attribution.scope.creatorFingerprint&&retentionDigest({id:receipt.actorId})===page.attribution.scope.creatorFingerprint&&receipt.retainedStudentHashes?.includes(retentionDigest({id:page.attribution.scope.studentId}))&&Date.parse(receipt.completedAt)>=Date.parse(page.adoptions.at(-1)!.at)&&paperCaptureRetainedSourceMatches('paperCapturePages',page,receipt)))fail();continue;}
   if(uploads.filter(upload=>upload.pageId===page.id&&upload.status==='completed'&&upload.actorId===page.attribution.ownerUserId).length!==1)fail();
   for(const adoption of page.adoptions.slice(1))if(commands.filter(command=>command.actorId===page.attribution.ownerUserId&&command.input.kind==='pageRevision'&&command.input.pageId===page.id&&command.input.input.expectedRevision===adoption.revision-1&&command.input.input.expectedVersionFingerprint===adoption.previousVersionFingerprint&&command.at===adoption.at&&paperImageVersion(page.versions[0].receipt.source,command.input.input.transform).fingerprint===adoption.versionFingerprint&&same(command.result,{kind:'pageRevision',pageId:page.id,revision:adoption.revision,versionFingerprint:adoption.versionFingerprint,savedAt:command.at})).length!==1)fail();
  }
  for(const command of commands){
   const input=command.input;
   if(input.kind==='upload'){if(uploads.filter(upload=>upload.commandId===command.id).length!==1)fail();}
   else if(input.kind==='completeUpload'||input.kind==='cancelUpload'){if(uploadById.get(input.uploadId)?.terminalCommandId!==command.id)fail();}
   else if(input.kind==='pageRevision'){
    const page=pageById.get(input.pageId),revision=Number(command.result.revision),adoption=page?.adoptions.find(row=>row.revision===revision),target=page&&paperImageVersion(page.versions[0].receipt.source,input.input.transform);
    if(!page||page.attribution.ownerUserId!==command.actorId||!same(command.scope,page.attribution.scope)||!adoption||!target||target.fingerprint!==adoption.versionFingerprint||!same(command.result,{kind:'pageRevision',pageId:page.id,revision,versionFingerprint:target.fingerprint,savedAt:command.at})||Date.parse(command.at)<Date.parse(adoption.at)||!(input.input.expectedRevision===revision-1&&input.input.expectedVersionFingerprint===adoption.previousVersionFingerprint&&command.at===adoption.at||input.input.expectedRevision===revision&&input.input.expectedVersionFingerprint===adoption.versionFingerprint))fail();
   }else if(input.kind==='groupRevision'){
    const group=groups.find(row=>row.id===input.groupId),revision=Number(command.result.revision),saved=group?.history.find(row=>row.version.revision===revision);
    if(!group||group.attribution.ownerUserId!==command.actorId||!same(command.scope,group.attribution.scope)||!saved||input.input.expectedRevision!==revision-1||command.at!==saved.at||!same(command.result,{kind:'groupRevision',groupId:group.id,revision,fingerprint:saved.version.fingerprint,savedAt:command.at}))fail();
    const expected=preparePaperCaptureGroup(group.id,command.scope,input.input,pages.map(page=>({scope:page.attribution.scope,source:page.versions[0].receipt.source,versions:page.versions.map(version=>{const file=version.receipt.files.find(file=>file.role==='derived')!;return{version:version.receipt.version,renderedSha256:file.sha256,renderedBytes:file.bytes,mediaType:'image/png' as const};})})),group.history[revision-2]?.version);if(!same(expected,saved.version))fail();
   }else if(!['recognize','cancelDerivation','retryDerivation'].includes(input.kind))throw Error('paper_capture_group_native_not_ready');
  }
  for(const group of groups){
   scope(group.attribution.scope);assertPaperCaptureAttribution(group.attribution,users,receipts);
   if(group.attribution.ownerUserId===null){if(!receipts.some(receipt=>receipt.kind==='account_delete'&&receipt.subjectHash===group.attribution.scope.creatorFingerprint&&retentionDigest({id:receipt.actorId})===group.attribution.scope.creatorFingerprint&&receipt.retainedStudentHashes?.includes(retentionDigest({id:group.attribution.scope.studentId}))&&Date.parse(receipt.completedAt)>=Date.parse(group.history.at(-1)!.at)&&paperCaptureRetainedSourceMatches('paperCaptureGroups',group,receipt)))fail();continue;}
   for(const saved of group.history)if(commands.filter(command=>command.actorId===group.attribution.ownerUserId&&command.input.kind==='groupRevision'&&command.input.groupId===group.id&&command.input.input.expectedRevision===saved.version.revision-1&&command.at===saved.at&&same(command.result,{kind:'groupRevision',groupId:group.id,revision:saved.version.revision,fingerprint:saved.version.fingerprint,savedAt:saved.at})).length!==1)fail();
  }
  assertPaperCaptureDerivationRelations(state,tasks,checkFile);
  assertPaperCaptureRepairRelations(state,tasks);
 }catch(error){throw Error('paper_capture_saved_integrity_failed',{cause:error});}
}
