import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { controlledMaterialReviewSchema,controlledPacketFromActualMaterial,type ControlledMaterialReview } from './controlled-contrast-materials';
import type { ControlledContrastPacket } from './controlled-contrast-protocol';
import { retentionDigest } from './retention-anchor';
import { controlledReviewerSnapshot,isControlledActorIdentity } from './controlled-actor-identity';

type Row=Record<string,any>;
const collections=['users','knowledgeAtoms','curriculumRevisions','measurementItems','questions','questionDocuments','questionAnswerSchemas','questionSources','measurementCandidates']as const;
type Originals=Record<typeof collections[number],Row[]>;
export type ControlledMaterialSnapshot={protocol:'controlled-material-snapshot-v1';review:ControlledMaterialReview;packet:ControlledContrastPacket;originals:Originals;fingerprint:string};

/** Private publication material. Answers and grading keys never go to a learner preview. */
export function freezeControlledMaterialOriginal(store:InMemoryStoreService,reviewValue:unknown):ControlledMaterialSnapshot{
 const review=controlledMaterialReviewSchema.parse(reviewValue),packet=controlledPacketFromActualMaterial(store,review),atom=store.find('knowledgeAtoms',{id:review.atomId})!,atomIds=[atom.id,...atom.prerequisiteIds];
 const originals:Originals={users:[controlledReviewerSnapshot(store,review.reviewerId)],knowledgeAtoms:structuredClone(store.select('knowledgeAtoms',{id:atomIds})),curriculumRevisions:structuredClone(store.select('curriculumRevisions',{entityId:review.atomId,kind:'atom',version:1})),measurementItems:structuredClone(store.select('measurementItems',{id:review.itemId})),questions:structuredClone(store.select('questions',{id:review.questionId})),questionDocuments:structuredClone(store.select('questionDocuments',{questionId:review.questionId})),questionAnswerSchemas:structuredClone(store.select('questionAnswerSchemas',{questionId:review.questionId})),questionSources:structuredClone(store.select('questionSources',{questionId:review.questionId})),measurementCandidates:structuredClone(store.select('measurementCandidates',{questionId:review.questionId}).map(({questionId,status,publishedHash})=>({questionId,status,publishedHash})))};
 // Atom teaching and source editor attribution are unnecessary to grade the original pair.
 originals.knowledgeAtoms=originals.knowledgeAtoms.map(({teaching,...atom})=>atom);
 originals.curriculumRevisions=originals.curriculumRevisions.map(row=>{const{teaching,...snapshot}=row.snapshot;return{id:row.id,entityId:row.entityId,kind:row.kind,version:row.version,snapshot};});
 const result={protocol:'controlled-material-snapshot-v1' as const,review:structuredClone(review),packet:structuredClone(packet),originals};const snapshot={...result,fingerprint:retentionDigest(result)};assertControlledMaterialOriginal(snapshot);return snapshot;
}

/** Verifies the original version without requiring today's question or today's source approval to stay unchanged. */
export function assertControlledMaterialOriginal(value:ControlledMaterialSnapshot){
 try{
  const{fingerprint,...body}=value;if(value.protocol!=='controlled-material-snapshot-v1'||!fingerprint||retentionDigest(body)!==fingerprint||Object.keys(value).sort().join(',')!==['protocol','review','packet','originals','fingerprint'].sort().join(',')||Object.keys(value.originals).sort().join(',')!==[...collections].sort().join(','))throw Error();
  const originals=value.originals,questionId=value.review.questionId,atomIds=new Set([value.review.atomId,...(originals.knowledgeAtoms.find(row=>row.id===value.review.atomId)?.prerequisiteIds??[])]);
  if(originals.users.length!==1||originals.users[0].id!==value.review.reviewerId||!isControlledActorIdentity(value.review.reviewerId)||originals.users[0].role!=='admin'&&originals.users[0].role!=='teacher'||originals.users[0].status!=='active'||Object.keys(originals.users[0]).sort().join(',')!=='id,role,status')throw Error();
  if(originals.measurementItems.length!==1||originals.questions.length!==1||originals.questionAnswerSchemas.length!==1||originals.questionSources.length!==1||originals.questionDocuments.length>1||originals.measurementCandidates.length>1||originals.knowledgeAtoms.length!==atomIds.size||originals.knowledgeAtoms.some(row=>!atomIds.has(row.id))||new Set(originals.knowledgeAtoms.map(row=>row.id)).size!==originals.knowledgeAtoms.length||originals.curriculumRevisions.some(row=>!atomIds.has(row.entityId)))throw Error();
  for(const name of ['questionDocuments','questionAnswerSchemas','questionSources','measurementCandidates']as const)if(originals[name].some(row=>row.questionId!==questionId))throw Error();
  const matches=(row:Row,where:Row)=>Object.entries(where??{}).every(([key,item])=>Array.isArray(item)?item.includes(row[key]):row[key]===item),store={select:(name:string,where:Row)=>(originals[name as keyof Originals]??[]).filter(row=>matches(row,where)),find:(name:string,where:Row)=>(originals[name as keyof Originals]??[]).find(row=>matches(row,where)),inspect:(name:string)=>originals[name as keyof Originals]??[]}as unknown as InMemoryStoreService;
  if(retentionDigest(controlledPacketFromActualMaterial(store,value.review))!==retentionDigest(value.packet))throw Error();return value;
 }catch(error){throw Error('controlled_material_original_snapshot_integrity_failed',{cause:error});}
}
