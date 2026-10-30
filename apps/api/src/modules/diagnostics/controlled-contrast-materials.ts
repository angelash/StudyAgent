import { z } from 'zod';
import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { eligibleMeasurements } from './eligible-measurements';
import { atomDefinitionFingerprint,questionContentFingerprint } from './measurement-definition';
import { retentionDigest } from './retention-anchor';
import { contrastPacketSchema,type ControlledContrastPacket } from './controlled-contrast-protocol';
import { controlledReviewerSnapshot } from './controlled-actor-identity';
import type { ControlledMaterialSnapshot } from './controlled-contrast-snapshot';

const id=z.string().min(1).max(180),hash=z.string().regex(/^[a-f0-9]{64}$/),text=z.string().trim().min(5).max(3000);
export const controlledMaterialReviewSchema=z.object({protocol:z.literal('controlled-material-review-v1'),id,itemId:id,mappingVersion:z.number().int().positive(),questionId:id,questionVersion:z.number().int().positive(),atomId:id,definitionFingerprint:hash,contentFingerprint:hash,prerequisiteFingerprint:hash,operation:text,representation:text,requiredConditions:z.array(text).min(1).max(30),reason:text,reviewerId:id,reviewedAt:z.string().datetime(),decision:z.literal('approved'),publicationConsent:z.literal('shared-controlled-material-v1')}).strict();
export type ControlledMaterialReview=z.infer<typeof controlledMaterialReviewSchema>;

/** Read only: an authorized editor later freezes this exact approval; AI suggestions are not approvals. */
export function controlledPacketFromActualMaterial(store:InMemoryStoreService,value:unknown):ControlledContrastPacket{
 try{
  const review=controlledMaterialReviewSchema.parse(value);if(retentionDigest(review)!==retentionDigest(value))throw Error();
  controlledReviewerSnapshot(store,review.reviewerId);
  const mapping=eligibleMeasurements(store,[review.atomId]).find(row=>row.id===review.itemId),atom=store.find('knowledgeAtoms',{id:review.atomId}),question=store.find('questions',{id:review.questionId}),source=store.find('questionSources',{questionId:review.questionId}),schema=store.find('questionAnswerSchemas',{questionId:review.questionId});
  if(!mapping||!atom||!question||!source||!schema||mapping.questionId!==review.questionId||mapping.version!==review.mappingVersion||mapping.questionVersion!==review.questionVersion||atomDefinitionFingerprint(atom)!==review.definitionFingerprint||questionContentFingerprint(store,review.questionId)!==review.contentFingerprint||mapping.dimension==='retention'||source.licenseClass==='C_PUBLIC_REFERENCE_ONLY')throw Error();
  const prerequisites=atom.prerequisiteIds.map(atomId=>{const prerequisite=store.find('knowledgeAtoms',{id:atomId,status:'published'});if(!prerequisite||prerequisite.subject!==atom.subject)throw Error();return{atomId,definitionFingerprint:atomDefinitionFingerprint(prerequisite)};}).sort((a,b)=>a.atomId.localeCompare(b.atomId));
  if(retentionDigest(prerequisites)!==review.prerequisiteFingerprint)throw Error();
  return contrastPacketSchema.parse({questionId:question.id,itemId:mapping.id,questionVersion:review.questionVersion,mappingVersion:review.mappingVersion,atomId:atom.id,family:mapping.family,dimension:mapping.dimension,contentFingerprint:review.contentFingerprint,definitionFingerprint:review.definitionFingerprint,materialReviewId:review.id,materialReviewFingerprint:retentionDigest(review),operationFingerprint:retentionDigest({operation:review.operation}),prerequisiteFingerprint:review.prerequisiteFingerprint,representationFingerprint:retentionDigest({representation:review.representation}),scoringFingerprint:retentionDigest({answer:question.answer,mode:schema.mode,responseShape:schema.responseShape,validationRules:schema.validationRules,gradingConfig:schema.gradingConfig}),requiredConditionsFingerprint:retentionDigest({conditions:review.requiredConditions}),answerMode:schema.mode,expectedSeconds:mapping.expectedSeconds,licenseClass:source.licenseClass,reviewStatus:'approved'});
 }catch(error){throw Error('controlled_contrast_material_original_unavailable',{cause:error});}
}

/** All packet fields are rebuilt from current actual records and the retained reviewed controls. */
export function actualControlledPacketMatches(store:InMemoryStoreService,packet:ControlledContrastPacket,review:unknown,original?:ControlledMaterialSnapshot){
 try{
  // A legitimately published shared approval retains the actual past editor
  // snapshot; current source/content checks still use today's real records.
  const current=original?{find:(name:string,where:any)=>name==='users'?original.originals.users.find(row=>Object.entries(where).every(([key,value])=>row[key]===value)):store.find(name as any,where),select:(name:string,where:any)=>store.select(name as any,where),inspect:(name:string)=>name==='users'?original.originals.users:store.inspect(name as any)}as unknown as InMemoryStoreService:store;
  return retentionDigest(controlledPacketFromActualMaterial(current,review))===retentionDigest(packet);
 }catch{return false;}
}
