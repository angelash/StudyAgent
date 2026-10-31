import type {PrivacyReceipt} from '@study-agent/contracts';
import type {InMemoryStoreService} from '../../infrastructure/in-memory-store.service';
import {retentionDigest} from '../diagnostics/retention-anchor';
import {anonymizePaperCaptureAttribution} from './paper-capture-attribution';
import {paperCaptureRetentionProof,paperCaptureRetainedSourceMatches} from './paper-capture-retention-proof';
import {assertPaperCaptureNativeRows} from './paper-capture-native';
import type {StudioMaterialRecord} from './studio-material-access';

export const paperCaptureAttributedCollections=['paperCapturePages','paperCaptureGroups','paperCaptureDerivations','paperCaptureRepairs'] as const;
export const paperCapturePrivateCollections=['paperImageUploads','paperCaptureCommands','paperCaptureRepairUploads','paperCaptureRepairCommands'] as const;
export const paperCaptureCollections=[...paperCaptureAttributedCollections,...paperCapturePrivateCollections] as const;

/** Retained source scope comes from actual authored records or an original
 * learning authorization. Administration access alone creates no relationship.
 * The caller excludes children actually selected for deletion in this request. */
export function paperCaptureAccountRetainedStudents(store:InMemoryStoreService,actorId:string){
 const ids=new Set<string>();
 for(const name of paperCaptureAttributedCollections)for(const row of store.inspect(name))if(row.attribution.ownerUserId===actorId&&row.attribution.scope.studentId)ids.add(row.attribution.scope.studentId);
 for(const row of store.inspect('paperImageUploads'))if(row.learningAccess?.guardianId===actorId&&row.scope.studentId)ids.add(row.scope.studentId);
 for(const row of store.inspect('paperCaptureCommands'))if(row.authorization?.learningAccess?.guardianId===actorId&&row.scope.studentId)ids.add(row.scope.studentId);
 for(const name of ['paperCaptureRepairUploads','paperCaptureRepairCommands']as const)for(const row of store.inspect(name))if(row.authorization.learningAccess?.guardianId===actorId&&row.scope.studentId)ids.add(row.scope.studentId);
 for(const row of store.inspect('studioSourceMaterials')as StudioMaterialRecord[])if(row.paperCaptureOrigin&&row.processingAccess?.guardianId===actorId&&row.studentId)ids.add(row.studentId);
 return[...ids].sort();
}

/** Used by both actual account deletion and latest-ledger restoration, before
 * removing users. The receipt is the authority; fingerprints and frozen source
 * versions are deliberately preserved. No user command is invented here.
 */
export function anonymizePaperCapturePrivacy(store:InMemoryStoreService,actorId:string,receipt:PrivacyReceipt,captureProofs=false,tasks:readonly unknown[]=[]){
 if(captureProofs){const names=[...paperCaptureCollections,'paperCaptureFileAssets','studioMaterialAssets','studioSourceMaterials','users','students','privacyRequests']as const;assertPaperCaptureNativeRows(names.flatMap(collection=>store.inspect(collection).map(body=>({collection,record_id:body.id,body}))),tasks);}
 if(captureProofs){if(receipt.retainedPaperSources!==undefined)throw Error('paper_capture_retention_proofs_already_fixed');receipt.retainedPaperSources=[];}
 for(const name of paperCaptureAttributedCollections){
  const retained=[];
  for(const row of store[name]??[]){
   if(row.attribution.ownerUserId!==actorId){retained.push(row);continue;}
   const attribution=anonymizePaperCaptureAttribution(row.attribution,actorId,receipt);
   if(attribution){const anonymous={...row,attribution} as typeof row;if(captureProofs)receipt.retainedPaperSources!.push(paperCaptureRetentionProof(name,anonymous));else if(!paperCaptureRetainedSourceMatches(name,anonymous,receipt))throw Error('paper_capture_actual_retained_source_proof_required');retained.push(anonymous);}
  }
  // Each collection has its own record type; the helper preserves that type.
  (store[name] as unknown[])=retained;
 }
 if(captureProofs)receipt.retainedPaperSources!.sort((left,right)=>left.collection.localeCompare(right.collection)||left.id.localeCompare(right.id));
 for(const upload of store.paperImageUploads??[]){
  if(upload.actorId===actorId||upload.learningAccess?.guardianId!==actorId)continue;
  if(!upload.scope.studentId||!receipt.retainedStudentHashes?.includes(retentionDigest({id:upload.scope.studentId})))continue;
  if(receipt.kind!=='account_delete'||receipt.actorId!==actorId||receipt.subjectHash!==retentionDigest({id:actorId})||Date.parse(receipt.completedAt)<Date.parse(upload.createdAt))throw Error('paper_capture_original_guardian_deletion_receipt_required');
  delete upload.learningAccess;upload.guardianDeletionHash=receipt.subjectHash;
  if(upload.status==='uploading'){
   upload.status='cancelled';upload.endedAt=receipt.completedAt;upload.terminalCommandId=null;upload.revision++;
   for(const command of store.paperCaptureCommands??[]){
    if(command.actorId!==upload.actorId||command.status!=='preparing'||!('uploadId'in command.input)||command.input.uploadId!==upload.id)continue;
    command.status='rejected';command.at=receipt.completedAt;command.errorCode='original_guardian_deleted';
   }
  }
 }
 for(const command of store.paperCaptureCommands??[]){
  if(command.actorId===actorId||command.authorization?.learningAccess?.guardianId!==actorId)continue;
  if(!command.scope.studentId||!receipt.retainedStudentHashes?.includes(retentionDigest({id:command.scope.studentId})))continue;
  if(Date.parse(receipt.completedAt)<Date.parse(command.at))throw Error('paper_capture_original_guardian_deletion_receipt_required');
  delete command.authorization.learningAccess;command.authorization.guardianDeletionHash=receipt.subjectHash;
 }
 for(const name of ['paperCaptureRepairUploads','paperCaptureRepairCommands']as const)for(const row of store[name]??[]){
  if(row.actorId===actorId||row.authorization.learningAccess?.guardianId!==actorId||!row.scope.studentId||!receipt.retainedStudentHashes?.includes(retentionDigest({id:row.scope.studentId})))continue;
  if(Date.parse(receipt.completedAt)<Date.parse('createdAt'in row?row.createdAt:row.at))throw Error('paper_capture_original_guardian_deletion_receipt_required');
  delete row.authorization.learningAccess;row.authorization.guardianDeletionHash=receipt.subjectHash;
  if('chunks'in row&&row.status==='uploading'){row.status='cancelled';row.systemClosure='guardian_deleted';row.endedAt=receipt.completedAt;row.revision++;}
 }
 for(const material of (store.studioSourceMaterials??[])as StudioMaterialRecord[]){
  if(!material.paperCaptureOrigin||material.processingAccess?.guardianId!==actorId||!material.studentId||!receipt.retainedStudentHashes?.includes(retentionDigest({id:material.studentId})))continue;
  delete material.processingAccess;material.processingGuardianDeletionHash=receipt.subjectHash;
 }
}

/** Portable sources never expose a different guardian's raw account identity. */
export function portablePaperCaptureSource(row:Record<string,any>,owners:Set<string>,actorId:string){
 const{ownerUserId,ownerDeletionHash:_deletion,...attribution}=row.attribution;
 const{taskId:_task,...source}=row;
 const intent=source.intent?(({uploadId:_upload,taskId:_task,...intent})=>intent)(source.intent):undefined;
 return{...source,...(intent?{intent}:{}),attribution:{...attribution,author:ownerUserId===null?'closed_account':ownerUserId===actorId?'self':owners.has(ownerUserId)?'learner':'shared_guardian'}};
}
