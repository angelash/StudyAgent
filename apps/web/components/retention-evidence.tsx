'use client';
import type { RetentionEvidence,RetentionReadiness } from '@study-agent/contracts';
import { RetentionSourceLinks } from './retention-source-link';
const labels:Record<RetentionEvidence['status'],string>={interval_met:'已满足这次真实间隔',not_elapsed:'最近教学后的间隔还不够',no_independent_baseline:'尚缺可核对的独立基准',unknown_source:'部分教学来源仍需核对',not_independent:'本次回答不能作为独立保持样本'};
const date=(value:string)=>new Date(value).toLocaleString('zh-CN');
export function RetentionEvidenceSummary({evidence}:{evidence?:RetentionEvidence}){
 if(!evidence)return null;
 return <section className="diagnostic-observation" aria-label="教学后保持依据"><h5>{labels[evidence.status]}</h5><p>本次要求间隔 {evidence.requiredIntervalDays} 天。{evidence.elapsedDays===null?'实际间隔尚不可核对。':'实际经过 '+(Math.floor(evidence.elapsedDays*24*10)/10)+' 小时。'}</p>
 {evidence.baseline&&<p>原独立基准：{date(evidence.baseline.at)}。</p>}{evidence.anchor&&<p>{evidence.anchor.kind==='independent_baseline'?'本次从原独立基准计时':'本次从最近可核对的教学或帮助计时'}：{date(evidence.anchor.at)}。</p>}
 {evidence.earliestEligibleAt&&<p>最早间隔边界：{date(evidence.earliestEligibleAt)}。</p>}{!!evidence.unresolvedSourceIds.length&&<p>有 {evidence.unresolvedSourceIds.length} 项来源无法完整核对，当前保持资格未知。</p>}
 <RetentionSourceLinks evidence={evidence}/><p>日程完成、看过讲解和本次安排都不能单独证明掌握。</p></section>;
}
export function RetentionReadinessSummary({readiness}:{readiness?:RetentionReadiness}){
 if(!readiness)return null;
 return <p className="studio-muted" role="status">{readiness.notice}{!readiness.canStart&&readiness.reason==='waiting_interval'&&<> 最早可核对：{date(readiness.earliestAt)}。</>}{!readiness.independentBaselineAvailable&&' 原独立基准仍待核查，本次新题也不能自动补成旧保持证据。'}</p>;
}
