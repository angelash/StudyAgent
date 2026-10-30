import { createHash } from 'node:crypto';
import { assertControlledContrastProtocol,controlledProtocolFingerprint,type ControlledContrastPacket } from './controlled-contrast-protocol';
import { assertControlledContrastBlueprint } from './controlled-contrast-selection';
import { retentionDigest } from './retention-anchor';

/** A public hash alone never proves that a selected pair belonged to its original reviewed protocol. */
export function assertControlledContrastSource(value:unknown,originalProtocol:unknown,resolveOriginalPacket:(packet:ControlledContrastPacket)=>boolean){
 try{
  const blueprint=assertControlledContrastBlueprint(value),protocol=assertControlledContrastProtocol(originalProtocol,resolveOriginalPacket),fingerprint=controlledProtocolFingerprint(protocol);
  if(blueprint.sourceProtocolId!==protocol.id||blueprint.sourceProtocolRevision!==protocol.revision||blueprint.sourceProtocolFingerprint!==fingerprint||blueprint.subject!==protocol.subject||blueprint.cause!==protocol.cause||blueprint.atomId!==protocol.atomId||blueprint.definitionFingerprint!==protocol.definitionFingerprint||blueprint.familyIdentityVersion!==protocol.familyIdentityVersion||blueprint.availableIndependentUnits>protocol.units.length)throw Error();
  const rank=(id:string)=>createHash('sha256').update(JSON.stringify([blueprint.seed,fingerprint,id])).digest('hex'),firstControl=parseInt(rank('arm-order').slice(0,2),16)%2===0;
  let priorRank='';
  for(const[index,selected]of blueprint.units.entries()){
   const original=protocol.units.find(unit=>unit.id===selected.unitId),position=rank(selected.unitId);
   if(!original||selected.family!==original.family||priorRank&&position<priorRank)throw Error();priorRank=position;
   const controlFirst=(index%2===0)===firstControl;
   if(selected.order[0].condition!==(controlFirst?'control':'challenge'))throw Error();
   for(const arm of selected.order)if(retentionDigest(arm.packet)!==retentionDigest(original[arm.condition]))throw Error();
  }
  return blueprint;
 }catch(error){throw Error('controlled_contrast_original_source_integrity_failed',{cause:error});}
}
