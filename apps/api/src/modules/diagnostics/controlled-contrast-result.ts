import type { DiagnosticResponse,ControlledContrastResult,ControlledContrastUnitStatus } from '@study-agent/contracts';
import { independentFamilyKey } from './family-identity';
import { retentionDigest } from './retention-anchor';
import type { ControlledContrastBlueprint } from './controlled-contrast-selection';
import { assertControlledContrastBlueprint } from './controlled-contrast-selection';
import { collectRetentionExposures,type RetentionRetainedRecords } from './retention-source';
type UnitStatus=ControlledContrastUnitStatus;
/** Counts independent matched units; two arms never become two independent units. */
export function evaluateControlledContrasts(blueprint:ControlledContrastBlueprint,responses:readonly DiagnosticResponse[],sessionId:string,context:{sourceScope:'retained-platform-sources-v1';startedAt:string;records:RetentionRetainedRecords}):ControlledContrastResult{
 assertControlledContrastBlueprint(blueprint);const started=Date.parse(context.startedAt);if(!sessionId||context.sourceScope!=='retained-platform-sources-v1'||!Number.isFinite(started))throw Error('invalid_controlled_contrast_session');
 const teaching=collectRetentionExposures(context.records,{studentId:blueprint.studentId,subject:blueprint.subject,atomId:blueprint.atomId,definitionFingerprint:blueprint.definitionFingerprint});
 const used=new Set<string>();
 const units=blueprint.units.map(unit=>{
  const rows=unit.order.map(({packet})=>responses.filter(row=>row.sessionId===sessionId&&row.studentId===blueprint.studentId&&row.itemId===packet.itemId));
  let status:UnitStatus='incomplete';const evidenceIds=rows.flat().map(row=>row.id),interferenceSourceIds:string[]=[];
  if(rows.every(rows=>rows.length===1)){
   const exact=rows.map(rows=>rows[0]);
   if(exact.some((row,index)=>{const packet=unit.order[index].packet;return used.has(row.id)||row.atomId!==blueprint.atomId||row.questionId!==packet.questionId||row.questionVersion!==packet.questionVersion||row.mappingVersion!==packet.mappingVersion||row.atomDefinitionFingerprint!==blueprint.definitionFingerprint||independentFamilyKey(row)!==independentFamilyKey(packet)||!Number.isFinite(Date.parse(row.submittedAt))||Date.parse(row.submittedAt)<started;}))status='source_mismatch';
   else if(exact.some(row=>row.disposition!=='answered'))status='incomplete';
   else if(exact.some(row=>row.status!=='scored'||typeof row.correct!=='boolean'||typeof row.score!=='number'||!Number.isFinite(row.score)||row.score<0||row.score>1||row.correct!==(row.score===1)))status='unscored';
   else if(exact.some(row=>row.hintLevel!==0||row.priorExposure))status='assisted_or_exposed';
   else{
    const cutoff=Math.max(...exact.map(row=>Date.parse(row.submittedAt)));let unknown=false;
    for(const source of teaching){
     if(source.possibleAtRange){const from=Date.parse(source.possibleAtRange.fromAt),through=Date.parse(source.possibleAtRange.throughAt);if(Number.isFinite(from)&&Number.isFinite(through)&&from<=through&&(through<started||from>cutoff))continue;unknown=true;interferenceSourceIds.push(source.id);continue;}
     const at=Date.parse(source.at);if(Number.isFinite(at)&&(at<started||at>cutoff))continue;
     interferenceSourceIds.push(source.id);if(!Number.isFinite(at)||!source.sourceRetained||source.atomId===null||source.definitionFingerprint!==blueprint.definitionFingerprint)unknown=true;
    }
    if(interferenceSourceIds.length)status=unknown?'unknown_teaching_source':'intervening_teaching';
    else{const control=exact[unit.order.findIndex(row=>row.condition==='control')],challenge=exact[unit.order.findIndex(row=>row.condition==='challenge')];status=control.correct&&!challenge.correct?'directional_difference':!control.correct&&challenge.correct?'reverse_difference':challenge.correct?'counterevidence':'both_below';}
   }
   for(const row of exact)used.add(row.id);
  }
  return{unitId:unit.unitId,familyKey:independentFamilyKey({atomId:blueprint.atomId,family:unit.family}),evidenceIds,status,interferenceSourceIds:[...new Set(interferenceSourceIds)].sort()};
 });
 const count=(status:UnitStatus)=>new Set(units.filter(unit=>unit.status===status).map(unit=>unit.familyKey)).size,supportingUnits=count('directional_difference'),counterUnits=count('counterevidence')+count('reverse_difference'),supported=supportingUnits>=2,contradicted=counterUnits>=2;
 const result:Omit<ControlledContrastResult,'fingerprint'>={protocol:'controlled-cause-result-v1',sourceScope:context.sourceScope,startedAt:context.startedAt,blueprintFingerprint:blueprint.fingerprint,sessionId,studentId:blueprint.studentId,atomId:blueprint.atomId,cause:blueprint.cause,units,supportingUnits,counterUnits,reverseUnits:count('reverse_difference'),bothBelowUnits:count('both_below'),status:supported&&contradicted?'inconclusive':contradicted?'contradicted':supported?'supported':'insufficient',independentUnits:new Set(units.filter(unit=>['directional_difference','counterevidence','reverse_difference','both_below'].includes(unit.status)).map(unit=>unit.familyKey)).size,notice:'这里只核对受控任务中的实际差异及平台保留的教学来源；有效成对单元和反向结果分别保留，不推断心理标签或单一因果。'};
 return{...result,fingerprint:retentionDigest(result)};
}
