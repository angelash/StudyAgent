import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { z } from 'zod';
import { retentionDigest } from './retention-anchor';
import { controlledMaterialApprovalInputSchema,controlledPublicationInputSchema,controlledEditorialCommandId,controlledEditorialCommandHash,prepareControlledMaterialApproval,prepareControlledProtocolPublication,type ControlledEditorialActor } from './controlled-editorial-command';
import type { ControlledMaterialSnapshot } from './controlled-contrast-snapshot';
import type { ControlledContrastPublication } from './controlled-contrast-publication';
import { controlledActorIdentity } from './controlled-actor-identity';

export type ControlledReviewRecord={protocol:'controlled-material-review-record-v1';id:string;snapshot:ControlledMaterialSnapshot;actorId:string|null;commandId:string|null;actorDeletionHash?:string;createdAt:string};
export type ControlledReleaseRevision={revision:number;publicationId:string|null;previousPublicationId:string|null;state:'published'|'withdrawn';actorId:string;commandId:string|null;actorDeletionHash?:string;at:string;reason:string};
export type ControlledReleaseRecord={protocol:'controlled-contrast-release-v1';id:string;logicalId:string;revision:number;history:ControlledReleaseRevision[];createdAt:string;updatedAt:string};
export type ControlledEditorialCommand={protocol:'controlled-editorial-command-v1';id:string;actorId:string;requestKey:string;kind:'material-approve'|'protocol-publish'|'protocol-withdraw';resourceId:string;input:unknown;requestHash:string;result:unknown;resultHash:string;at:string};
export type ControlledEditorialRepository={reviews:readonly ControlledReviewRecord[];publications:readonly ControlledContrastPublication[];releases:readonly ControlledReleaseRecord[];commands:readonly ControlledEditorialCommand[];appendReview:(row:ControlledReviewRecord)=>void;appendPublication:(row:ControlledContrastPublication)=>void;saveRelease:(row:ControlledReleaseRecord)=>void;appendCommand:(row:ControlledEditorialCommand)=>void};
const id=z.string().min(1).max(180),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const controlledWithdrawalInputSchema=z.object({protocol:z.literal('controlled-withdrawal-input-v1'),logicalId:id,expectedReleaseRevision:z.number().int().positive(),expectedPublicationId:id,expectedContentFingerprint:hash,reason:z.string().trim().min(5).max(3000),requestKey:z.string().min(8).max(180),acknowledgeHistoricalSessions:z.literal(true)}).strict();
export const controlledReleaseId=(logicalId:string)=>'controlled_release:'+retentionDigest({logicalId});
export const controlledWorkflowCommandHash=(kind:ControlledEditorialCommand['kind'],actorId:string,input:unknown)=>kind==='protocol-withdraw'?retentionDigest({protocol:'controlled-editorial-command-v1',kind,actorId,input}):controlledEditorialCommandHash(kind,actorId,input);

/** All repository mutations belong to the caller's real transaction; this module registers no HTTP or storage. */
export function executeControlledEditorial(store:InMemoryStoreService,repository:ControlledEditorialRepository,actor:ControlledEditorialActor,kind:ControlledEditorialCommand['kind'],value:unknown,at=new Date().toISOString()){
 const actual=store.find('users',{id:actor.id,status:'active'});if(!actual||actual.role!==actor.role||!['admin','teacher'].includes(actual.role)||actor.status!=='active')throw Error('controlled_editorial_authority_changed');
 const input=kind==='material-approve'?controlledMaterialApprovalInputSchema.parse(value):kind==='protocol-publish'?controlledPublicationInputSchema.parse(value):controlledWithdrawalInputSchema.parse(value);
 if(retentionDigest(input)!==retentionDigest(value)||!Number.isFinite(Date.parse(at)))throw Error('controlled_editorial_full_command_required');
 const commandId=controlledEditorialCommandId(actor.id,input.requestKey),requestHash=controlledWorkflowCommandHash(kind,actor.id,input),saved=repository.commands.find(row=>row.id===commandId);
 // Complete original replay precedes mutable content, material availability and
 // release checks; it never borrows another editor's or command's receipt.
 if(saved){if(saved.actorId!==actor.id||saved.kind!==kind||saved.requestHash!==requestHash||saved.resultHash!==retentionDigest(saved.result))throw Error('controlled_editorial_original_command_conflict');return structuredClone(saved.result);}
 let result:unknown,resourceId:string;
 if(kind==='material-approve'){
  const prepared=prepareControlledMaterialApproval(store,actor,input,at),snapshot=prepared.snapshot;if(repository.reviews.some(row=>row.id===snapshot.review.id))throw Error('controlled_editorial_original_command_missing');
  const row:ControlledReviewRecord={protocol:'controlled-material-review-record-v1',id:snapshot.review.id,snapshot,actorId:actor.id,commandId,createdAt:at};repository.appendReview(row);resourceId=row.id;
  result={protocol:'controlled-material-approval-receipt-v1',id:row.id,reviewedAt:at,reviewerId:snapshot.review.reviewerId,snapshotFingerprint:snapshot.fingerprint,packet:structuredClone(snapshot.packet)};
 }else{
  const command=kind==='protocol-publish'?controlledPublicationInputSchema.parse(input):controlledWithdrawalInputSchema.parse(input),current=repository.releases.find(row=>row.logicalId===command.logicalId),last=current?.history.at(-1),history=[...(current?.history??[])];resourceId=controlledReleaseId(command.logicalId);
  let publication:ControlledContrastPublication|undefined,revision:ControlledReleaseRevision;
  if(kind==='protocol-publish'){
   const latest=[...repository.publications].filter(row=>row.logicalId===command.logicalId).sort((a,b)=>b.revision-a.revision)[0],prepared=prepareControlledProtocolPublication(store,actor,input,at,repository.reviews.map(row=>row.snapshot),latest);publication=prepared.publication;
   if(repository.publications.some(row=>row.id===publication!.id))throw Error('controlled_publication_original_revision_conflict');
   repository.appendPublication(publication);revision={revision:(current?.revision??0)+1,publicationId:publication.id,previousPublicationId:last?.publicationId??last?.previousPublicationId??null,state:'published',actorId:controlledActorIdentity(actor.id),commandId,at,reason:'教研主体逐项核对实际原题与控制变量后明确发布。'};
  }else{
   const withdraw=controlledWithdrawalInputSchema.parse(input);publication=repository.publications.find(row=>row.id===withdraw.expectedPublicationId);
   if(!current||!last||last.state!=='published'||current.revision!==withdraw.expectedReleaseRevision||last.publicationId!==withdraw.expectedPublicationId||!publication||publication.logicalId!==withdraw.logicalId||publication.contentFingerprint!==withdraw.expectedContentFingerprint)throw Error('controlled_publication_current_release_changed');
   revision={revision:current.revision+1,publicationId:null,previousPublicationId:publication.id,state:'withdrawn',actorId:controlledActorIdentity(actor.id),commandId,at,reason:withdraw.reason};
  }
  history.push(revision);const row:ControlledReleaseRecord={protocol:'controlled-contrast-release-v1',id:resourceId,logicalId:command.logicalId,revision:revision.revision,history,createdAt:current?.createdAt??at,updatedAt:at};repository.saveRelease(row);
  result={protocol:'controlled-publication-operation-receipt-v1',releaseId:row.id,logicalId:row.logicalId,releaseRevision:row.revision,state:revision.state,publicationId:publication.id,publicationRevision:publication.revision,contentFingerprint:publication.contentFingerprint,at};
 }
 const row:ControlledEditorialCommand={protocol:'controlled-editorial-command-v1',id:commandId,actorId:actor.id,requestKey:input.requestKey,kind,resourceId,input:structuredClone(input),requestHash,result:structuredClone(result),resultHash:retentionDigest(result),at};repository.appendCommand(row);return structuredClone(result);
}
