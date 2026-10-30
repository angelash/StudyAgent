import { z } from 'zod';
import { canonicalFamily,independentFamilyKey,FAMILY_IDENTITY_VERSION } from './family-identity';
import { retentionDigest } from './retention-anchor';

const id=z.string().min(1).max(180),hash=z.string().regex(/^[a-f0-9]{64}$/),text=z.string().trim().min(5).max(3000);
export const controlledCauseSchema=z.enum(['language_condition_gap','relevant_condition_gap']);
export const contrastPacketSchema=z.object({questionId:id,itemId:id,questionVersion:z.number().int().positive(),mappingVersion:z.number().int().positive(),atomId:id,family:id,dimension:z.enum(['understanding','procedure','transfer']),contentFingerprint:hash,definitionFingerprint:hash,materialReviewId:id,materialReviewFingerprint:hash,operationFingerprint:hash,prerequisiteFingerprint:hash,representationFingerprint:hash,scoringFingerprint:hash,requiredConditionsFingerprint:hash,answerMode:id,expectedSeconds:z.number().int().min(5).max(600),licenseClass:z.enum(['A_INTERNAL','B_OPEN','D_COMMERCIAL_PARTNER']),reviewStatus:z.literal('approved')}).strict();
const unitSchema=z.object({id,family:id,control:contrastPacketSchema,challenge:contrastPacketSchema,changedCondition:text,changedSourceLocators:z.array(z.object({condition:z.enum(['control','challenge']),locator:text}).strict()).min(2).max(20),heldConditions:text,additionalKnowledgeExcluded:text,difficultyRationale:text,review:z.object({decision:z.literal('approved'),reviewerId:id,reviewedAt:z.string().datetime(),reason:text}).strict()}).strict();
export const controlledContrastProtocolSchema=z.object({protocol:z.literal('controlled-cause-contrast-v1'),sharing:z.literal('shared-controlled-protocol-v1'),id,revision:z.number().int().positive(),cause:controlledCauseSchema,subject:z.enum(['math','chinese','english','chemistry']),atomId:id,definitionFingerprint:hash,familyIdentityVersion:z.literal(FAMILY_IDENTITY_VERSION),controlCondition:text,challengeCondition:text,allowedChange:text,publishedBy:id,publishedAt:z.string().datetime(),units:z.array(unitSchema).min(2).max(20)}).strict();
export type ControlledContrastProtocol=z.infer<typeof controlledContrastProtocolSchema>;
export type ControlledContrastPacket=z.infer<typeof contrastPacketSchema>;
export const controlledProtocolFingerprint=(value:ControlledContrastProtocol)=>retentionDigest(value);

/** Caller must independently resolve each exact original packet and source approval. */
export function assertControlledContrastProtocol(value:unknown,resolvePacket:(packet:ControlledContrastPacket)=>boolean):ControlledContrastProtocol{
 try{
  const protocol=controlledContrastProtocolSchema.parse(value);if(retentionDigest(protocol)!==retentionDigest(value))throw Error();
  const units=new Set<string>(),families=new Set<string>(),questions=new Set<string>(),items=new Set<string>();
  for(const unit of protocol.units){
   const key=independentFamilyKey({atomId:protocol.atomId,family:unit.family});if(units.has(unit.id)||families.has(key)||Date.parse(unit.review.reviewedAt)>Date.parse(protocol.publishedAt)||new Set(unit.changedSourceLocators.map(row=>row.condition)).size!==2)throw Error();units.add(unit.id);families.add(key);
   for(const packet of [unit.control,unit.challenge]){
    if(packet.atomId!==protocol.atomId||packet.definitionFingerprint!==protocol.definitionFingerprint||canonicalFamily(packet)!==canonicalFamily({atomId:protocol.atomId,family:unit.family})||questions.has(packet.questionId)||items.has(packet.itemId)||!resolvePacket(packet))throw Error();questions.add(packet.questionId);items.add(packet.itemId);
   }
   for(const field of ['dimension','operationFingerprint','prerequisiteFingerprint','representationFingerprint','scoringFingerprint','requiredConditionsFingerprint','answerMode']as const)if(unit.control[field]!==unit.challenge[field])throw Error();
  }
  return protocol;
 }catch(error){throw Error('controlled_contrast_protocol_integrity_failed',{cause:error});}
}
