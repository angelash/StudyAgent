import { createHash } from 'node:crypto';

export const RETENTION_PROTOCOL='teaching-retention-v1' as const;
export const RETENTION_DAY_MS=86_400_000;
export const retentionExposureKinds=['practice_opened','practice_attempt','practice_hint','practice_reference','practice_demonstration','diagnostic_hint','generated_teaching_opened','generated_teaching_attempt','generated_teaching_help','classroom_teaching_displayed','classroom_hint','classroom_feedback'] as const;
type Subject='math'|'chinese'|'english'|'chemistry';
export type RetentionBaseline={id:string;sessionId:string;studentId:string;subject:Subject;atomId:string;definitionFingerprint:string;
 submittedAt:string;correct:boolean|null;status:string;disposition:string;hintLevel:number;priorExposure:boolean;sourceRetained:boolean};
export type RetentionExposure={id:string;studentId:string;subject:Subject;atomId:string|null;definitionFingerprint:string|null;
 kind:typeof retentionExposureKinds[number];sourceId:string;operationFingerprint:string;at:string;sourceRetained:boolean;possibleAtRange?:{fromAt:string;throughAt:string};navigation?:{sessionId:string;questionId?:string;assignmentId?:string;origin?:string}};
export type RetentionAnswer={status:string;disposition:string;hintLevel:number;priorExposure:boolean};
export type RetentionAnchorInput={studentId:string;subject:Subject;atomId:string;definitionFingerprint:string;sessionId:string;
 startedAt:string;answeredAt:string;intervalDays:1|3|7|14;answer:RetentionAnswer;baselines:readonly RetentionBaseline[];exposures:readonly RetentionExposure[]};
export type RetentionAnchorResult={protocol:typeof RETENTION_PROTOCOL;studentId:string;subject:Subject;atomId:string;definitionFingerprint:string;
 sessionId:string;startedAt:string;answeredAt:string;requiredIntervalDays:1|3|7|14;
 baseline:{id:string;sessionId:string;at:string}|null;anchor:{kind:'independent_baseline'|RetentionExposure['kind'];sourceId:string;at:string;fingerprint:string}|null;
 sources:Array<{id:string;kind:RetentionExposure['kind'];sourceId:string;at:string;fingerprint:string;navigation?:RetentionExposure['navigation']}>;
 unresolvedSourceIds:string[];elapsedMs:number|null;elapsedDays:number|null;earliestEligibleAt:string|null;
 status:'interval_met'|'not_elapsed'|'no_independent_baseline'|'unknown_source'|'not_independent';eligible:boolean;fingerprint:string};
const stable=(value:unknown):unknown=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,stable(item)])):value;
export const retentionDigest=(value:unknown)=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
function instant(value:string){const epoch=Date.parse(value);return typeof value==='string'&&Number.isFinite(epoch)&&new Date(epoch).toISOString()===value?epoch:null;}
const hash=(value:string)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const id=(value:string)=>typeof value==='string'&&value.length>0&&value.length<=650;

/** Pure qualification only. Callers resolve retained original sources, not client claims. */
export function measureRetentionAnchor(input:RetentionAnchorInput):RetentionAnchorResult{
 const started=instant(input.startedAt),answered=instant(input.answeredAt);
 if(!id(input.studentId)||!id(input.atomId)||!id(input.sessionId)||!hash(input.definitionFingerprint)||!['math','chinese','english','chemistry'].includes(input.subject)||![1,3,7,14].includes(input.intervalDays)||started===null||answered===null||answered<started)throw Error('invalid_retention_measurement_input');
 const same=(row:{studentId:string;subject:Subject;atomId:string|null})=>row.studentId===input.studentId&&row.subject===input.subject&&(row.atomId===input.atomId||row.atomId===null),unresolved=new Set<string>();
 const baselines=input.baselines.filter(row=>{
  if(!same(row)||row.atomId===null||row.sessionId===input.sessionId)return false;const at=instant(row.submittedAt);if(at!==null&&at>=started)return false;
  if(row.correct!==true||row.status!=='scored'||row.disposition!=='answered'||row.hintLevel!==0||row.priorExposure)return false;
  if(at===null||!row.sourceRetained){unresolved.add(row.id);return false;}return row.definitionFingerprint===input.definitionFingerprint;
 }).sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt)||a.id.localeCompare(b.id));
 const baseline=baselines[0],baselineAt=baseline?instant(baseline.submittedAt)!:null,sources:RetentionAnchorResult['sources']=[],seen=new Map<string,string>();
 for(const event of input.exposures){
  if(event.possibleAtRange){const from=instant(event.possibleAtRange.fromAt),through=instant(event.possibleAtRange.throughAt);if(from!==null&&through!==null&&from<=through&&(from>answered||baselineAt!==null&&through<baselineAt))continue;}
  if(!same(event))continue;const at=instant(event.at);if(at!==null&&(at>answered||baselineAt!==null&&at<baselineAt))continue;
  const fingerprint=retentionDigest(event),original=seen.get(event.id);if(original===fingerprint)continue;if(original){unresolved.add(event.id);continue;}seen.set(event.id,fingerprint);
  if(at===null||!id(event.id)||!id(event.sourceId)||!event.sourceRetained||!hash(event.operationFingerprint)||!retentionExposureKinds.includes(event.kind)||event.atomId===null||event.definitionFingerprint!==input.definitionFingerprint){unresolved.add(event.id);continue;}
  sources.push({id:event.id,kind:event.kind,sourceId:event.sourceId,at:event.at,fingerprint,...(event.navigation?{navigation:structuredClone(event.navigation)}:{})});
 }
 sources.sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
 const latest=sources.at(-1),anchor=latest?{kind:latest.kind,sourceId:latest.sourceId,at:latest.at,fingerprint:latest.fingerprint}:baseline?{kind:'independent_baseline' as const,sourceId:baseline.id,at:baseline.submittedAt,fingerprint:retentionDigest(baseline)}:null;
 const elapsedMs=anchor?answered-instant(anchor.at)!:null,earliestEligibleAt=anchor?new Date(instant(anchor.at)!+input.intervalDays*RETENTION_DAY_MS).toISOString():null;
 const independent=input.answer.status==='scored'&&input.answer.disposition==='answered'&&input.answer.hintLevel===0&&!input.answer.priorExposure&&!sources.some(source=>instant(source.at)!>=started);
 const status:RetentionAnchorResult['status']=unresolved.size?'unknown_source':!baseline?'no_independent_baseline':!independent?'not_independent':elapsedMs!<input.intervalDays*RETENTION_DAY_MS?'not_elapsed':'interval_met';
 const result={protocol:RETENTION_PROTOCOL,studentId:input.studentId,subject:input.subject,atomId:input.atomId,definitionFingerprint:input.definitionFingerprint,sessionId:input.sessionId,startedAt:input.startedAt,answeredAt:input.answeredAt,requiredIntervalDays:input.intervalDays,
  baseline:baseline?{id:baseline.id,sessionId:baseline.sessionId,at:baseline.submittedAt}:null,anchor,sources,unresolvedSourceIds:[...unresolved].sort(),elapsedMs,elapsedDays:elapsedMs===null?null:elapsedMs/RETENTION_DAY_MS,earliestEligibleAt,status,eligible:status==='interval_met'};
 return{...result,fingerprint:retentionDigest(result)};
}
