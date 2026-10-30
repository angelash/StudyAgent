import { assertControlledContrastProtocol,controlledProtocolFingerprint,type ControlledContrastProtocol } from './controlled-contrast-protocol';
import { assertControlledMaterialOriginal,type ControlledMaterialSnapshot } from './controlled-contrast-snapshot';
import { retentionDigest } from './retention-anchor';
import { controlledActorIdentity,isControlledActorIdentity } from './controlled-actor-identity';

type Publisher={id:string;role:'admin'|'teacher';status:'active'};
export type ControlledContrastPublication={protocol:'controlled-contrast-publication-v1';id:string;logicalId:string;revision:number;previousFingerprint:string|null;publisher:Publisher;content:ControlledContrastProtocol;originals:ControlledMaterialSnapshot[];contentFingerprint:string;fingerprint:string};
const publicationId=(logicalId:string,revision:number)=>'controlled_publication:'+retentionDigest({logicalId,revision});

/** Service supplies the actual current editor and retained source approvals in one publish transaction. */
export function prepareControlledPublication(contentValue:unknown,publisher:Publisher,originalValues:readonly ControlledMaterialSnapshot[],previous?:ControlledContrastPublication):ControlledContrastPublication{
 if(!publisher||!publisher.id||!['admin','teacher'].includes(publisher.role)||publisher.status!=='active'||Object.keys(publisher).sort().join(',')!=='id,role,status')throw Error('controlled_publication_actual_editor_required');
 publisher={...publisher,id:isControlledActorIdentity(publisher.id)?publisher.id:controlledActorIdentity(publisher.id)};
 const originals=originalValues.map(value=>assertControlledMaterialOriginal(value)),keys=new Set<string>();
 for(const original of originals){if(keys.has(original.review.id))throw Error('controlled_publication_duplicate_material_review');keys.add(original.review.id);}
 const content=assertControlledContrastProtocol(contentValue,packet=>{const original=originals.find(row=>row.review.id===packet.materialReviewId);return!!original&&retentionDigest(original.packet)===retentionDigest(packet);});
 if(content.publishedBy!==publisher.id||originals.length!==content.units.length*2||originals.some(row=>Date.parse(row.review.reviewedAt)>Date.parse(content.publishedAt)))throw Error('controlled_publication_original_review_mismatch');
 const reviewers=new Set([publisher.id,...originals.flatMap(row=>row.originals.users.map(user=>user.id))]);for(const unit of content.units)if(!reviewers.has(unit.review.reviewerId))throw Error('controlled_publication_task_reviewer_unavailable');
 if(previous){assertControlledPublication(previous);if(content.id!==previous.logicalId||content.revision!==previous.revision+1||content.subject!==previous.content.subject||content.atomId!==previous.content.atomId||content.cause!==previous.content.cause||Date.parse(content.publishedAt)<Date.parse(previous.content.publishedAt))throw Error('controlled_publication_original_revision_conflict');}
 else if(content.revision!==1)throw Error('controlled_publication_original_revision_conflict');
 const result={protocol:'controlled-contrast-publication-v1' as const,id:publicationId(content.id,content.revision),logicalId:content.id,revision:content.revision,previousFingerprint:previous?.fingerprint??null,publisher:structuredClone(publisher),content:structuredClone(content),originals:structuredClone(originals).sort((a,b)=>a.review.id.localeCompare(b.review.id)),contentFingerprint:controlledProtocolFingerprint(content)};
 return{...result,fingerprint:retentionDigest(result)};
}

/** Complete private original publication; a withdrawn current edition does not erase this snapshot. */
export function assertControlledPublication(value:ControlledContrastPublication){
 try{
  const{fingerprint,...body}=value;if(Object.keys(value).sort().join(',')!==['protocol','id','logicalId','revision','previousFingerprint','publisher','content','originals','contentFingerprint','fingerprint'].sort().join(',')||value.protocol!=='controlled-contrast-publication-v1'||value.id!==publicationId(value.logicalId,value.revision)||value.logicalId!==value.content.id||value.revision!==value.content.revision||value.contentFingerprint!==controlledProtocolFingerprint(value.content)||fingerprint!==retentionDigest(body)||(value.revision===1)!==(value.previousFingerprint===null))throw Error();
  if(!value.publisher||!isControlledActorIdentity(value.publisher.id)||value.publisher.id!==value.content.publishedBy||!['admin','teacher'].includes(value.publisher.role)||value.publisher.status!=='active'||Object.keys(value.publisher).sort().join(',')!=='id,role,status')throw Error();
  const ids=new Set<string>();for(const original of value.originals){assertControlledMaterialOriginal(original);if(ids.has(original.review.id)||Date.parse(original.review.reviewedAt)>Date.parse(value.content.publishedAt))throw Error();ids.add(original.review.id);}
  if(value.originals.length!==value.content.units.length*2||retentionDigest([...value.originals].sort((a,b)=>a.review.id.localeCompare(b.review.id)))!==retentionDigest(value.originals))throw Error();
  const content=assertControlledContrastProtocol(value.content,packet=>value.originals.some(original=>original.review.id===packet.materialReviewId&&retentionDigest(original.packet)===retentionDigest(packet))),reviewers=new Set([value.publisher.id,...value.originals.flatMap(row=>row.originals.users.map(user=>user.id))]);if(content.units.some(unit=>!reviewers.has(unit.review.reviewerId)))throw Error();return value;
 }catch(error){throw Error('controlled_contrast_publication_integrity_failed',{cause:error});}
}
export function assertControlledPublicationHistory(values:readonly ControlledContrastPublication[]){
 const ids=new Set<string>(),keys=new Set<string>();for(const value of values){assertControlledPublication(value);const key=JSON.stringify([value.logicalId,value.revision]);if(ids.has(value.id)||keys.has(key))throw Error('controlled_publication_duplicate_original');ids.add(value.id);keys.add(key);if(value.revision>1){const previous=values.find(row=>row.logicalId===value.logicalId&&row.revision===value.revision-1);if(!previous||previous.fingerprint!==value.previousFingerprint||value.content.subject!==previous.content.subject||value.content.atomId!==previous.content.atomId||value.content.cause!==previous.content.cause||Date.parse(value.content.publishedAt)<Date.parse(previous.content.publishedAt))throw Error('controlled_publication_original_history_missing');}}
}
