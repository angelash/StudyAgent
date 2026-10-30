'use client';
import type { ControlledCause,ControlledContrastResult,ControlledContrastUnitStatus } from '@study-agent/contracts';
import { DiagnosticEvidenceReferences } from './diagnostic-evidence';

const titles:Record<ControlledCause,string>={language_condition_gap:'文字条件需要单独核对',relevant_condition_gap:'相关条件的选择需要单独核对'};
const labels:Record<ControlledContrastResult['status'],string>={supported:'出现可重复差异，继续核查',contradicted:'已有对照反证',inconclusive:'支持与反证并存，暂不下结论',insufficient:'有效配对不足，保留未知'};
const unitLabels:Record<ControlledContrastUnitStatus,string>={directional_difference:'简洁条件达标，复杂条件未达标',counterevidence:'两侧均达标，构成反证',reverse_difference:'复杂条件达标，简洁条件未达标',both_below:'两侧均未达标，需核对其他解释',incomplete:'一侧缺少完整作答',unscored:'仍有回答等待评分核对',assisted_or_exposed:'存在帮助或原题曝光',source_mismatch:'原题、来源或测量定义需要核对',intervening_teaching:'本组期间收到相关教学或帮助',unknown_teaching_source:'相关教学时间或来源仍未知'};

/** Embed only after the authorized original group has ended and the server releases its result. */
export function ControlledContrastEvidence({result,studentId,atomId}:{result:ControlledContrastResult;studentId:string;atomId:string}){
 if(result.studentId!==studentId||result.atomId!==atomId)return <p role="alert">当前学习对象与这份对照结果不一致，请重新读取原报告。</p>;
 return <section className="diagnostic-observation" aria-label={titles[result.cause]+'的受控对照依据'}><span className="studio-badge">{labels[result.status]}</span><h5>{titles[result.cause]}</h5>
  <p>有效配对 {result.independentUnits} 组 · 支持方向 {result.supportingUnits} 组 · 反证 {result.counterUnits} 组。每组的两道题共同形成一份观察。</p>
  <p>{result.notice}</p><p>反向差异 {result.reverseUnits} 组，两侧均未达标 {result.bothBelowUnits} 组，均保留在下方原记录中。</p>
  <details><summary>核对每组原作答和不确定条件</summary>{result.units.map((unit,index)=><article className="kr-hypothesis" key={unit.unitId}><h5>第 {index+1} 组 · {unitLabels[unit.status]}</h5>{unit.interferenceSourceIds.length>0&&<p>有 {unit.interferenceSourceIds.length} 项教学或帮助来源影响这组的独立资格。</p>}<DiagnosticEvidenceReferences studentId={studentId} ids={unit.evidenceIds} title="这组成对任务的原作答" /></article>)}</details>
  <details><summary>这些结果能说明什么</summary><p>至少两个不同结构的独立配对呈现相同差异，才支持继续核查任务条件。未评分、缺一侧、接受帮助或原题曝光的配对不能补成独立观察。</p><p>两侧都未达标时还需检查当前操作、先修、题意和评分。反向差异单独保留；支持和反证并存时保持未定。</p><p>完成指导活动或日历任务不关闭原因。干预后仍需新的独立配对检验，也不能由此推断心理或人格标签。</p></details>
 </section>;
}
