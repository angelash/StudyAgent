'use client';

import type { AssessmentBlueprint, DiagnosticBlueprintView } from '@study-agent/contracts';
import { VerificationObservationPlan } from './verification-observations';
import './assessment-blueprint.css';

const dimensionNames = { understanding: '理解', procedure: '执行', transfer: '迁移', retention: '保持' };
type TeachingCoverageRow = NonNullable<AssessmentBlueprint['teachingCoverage']>[number];
/** Same rule as the server: fewer unexposed items than required needs new reviewed material; otherwise the budget deferred it. */
function gapKind(row: TeachingCoverageRow) { return row.selected >= row.required ? null : row.available < row.required ? 'exhausted' as const : 'deferred' as const; }
function gapText(row: TeachingCoverageRow) {
  const name = dimensionNames[row.purpose];
  if (gapKind(row) === 'deferred') return `${name}：本组题量或时间已到上限，原材料还有 ${row.available - row.selected} 题没排上，可以在下一组继续。`;
  return row.available ? `${name}：没接触过的原材料只有 ${row.available} 题，少于需要的 ${row.required} 题，需要教研补充并审核新材料。` : `${name}：没接触过的原材料已经用完，需要教研补充并审核新材料后再检查。`;
}
/** One line per gap kind for a knowledge point; the full per-purpose wording stays in the expandable list. */
function pointGaps(rows: TeachingCoverageRow[], atomId: string) {
  const own = rows.filter(row => row.atomId === atomId), exhausted = own.filter(row => gapKind(row) === 'exhausted'), deferred = own.filter(row => gapKind(row) === 'deferred');
  return [...(exhausted.length ? [{ kind: 'exhausted', text: '需补充审核材料：' + exhausted.map(row => dimensionNames[row.purpose]).join('、') }] : []),
    ...(deferred.length ? [{ kind: 'deferred', text: '下一组继续：' + deferred.map(row => `${dimensionNames[row.purpose]}（还有 ${row.available - row.selected} 题没排上）`).join('、') }] : [])];
}

export function AssessmentBlueprintCard({ preview, busy, onStart, onBack }: {
  preview: DiagnosticBlueprintView; busy: boolean; onStart: () => void; onBack: () => void;
}) {
  const names = new Map(preview.atomNames.map(atom => [atom.id, atom.name]));
  const teaching = preview.blueprint.teachingCoverage, deferred = teaching?.filter(row => gapKind(row) === 'deferred') ?? [], exhausted = teaching?.filter(row => gapKind(row) === 'exhausted') ?? [];
  const gapNotices = [...(deferred.length ? [`下一组可以继续 ${deferred.length} 项检查目的：原材料里还有这次没排上的题。`] : []),
    ...(exhausted.length ? [`${exhausted.length} 项检查目的没接触过的原材料不够本组要求，需要教研补充并审核新材料。`] : [])];
  return <section className="assessment-blueprint" aria-label="本次评测范围与题组">
    <div className="studio-section-head"><span className="studio-eyebrow">开始之前 / 先看看这一组</span>
      <h2>{preview.blueprint.title}，<br />一步一步来。</h2><p>{preview.blueprint.focus}</p></div>
    <div className="blueprint-scope"><span>{preview.scopeSnapshot.grade}年级 · {preview.scopeSnapshot.term === 'upper' ? '上学期' : '下学期'}</span>
      <strong>{preview.scopeSnapshot.textbookVersion}</strong><small>按已确认的学习进度安排</small></div>
    <dl className="blueprint-metrics"><div><dt>本组题目</dt><dd>{preview.itemCount}<small>题</small></dd></div>
      <div><dt>预计作答</dt><dd>{preview.itemCount ? Math.max(1, Math.ceil(preview.blueprint.expectedSeconds / 60)) : '—'}<small>分钟</small></dd></div>
      <div><dt>分成小组</dt><dd>{preview.blueprint.groups.length}<small>组</small></dd></div></dl>
    <p className="studio-muted">每组约{preview.blueprint.groupSize}题。可以保存草稿后休息，回来继续；预计时长用于安排题量，作答慢不会被直接解释为能力不足。</p>
    {preview.blueprint.routing && <div className="studio-hint"><strong>按作答逐步核查</strong><p>{preview.blueprint.routing.description}</p><p>下一题的顺序会变化；具体选题依据在结束后的记录中展开，本组不会即时公布对错或判定深层原因。</p></div>}
    <div className="blueprint-dimensions" aria-label="本组测量维度">{preview.blueprint.dimensions.map(row => <div key={row.dimension}>
      <span>{dimensionNames[row.dimension]}</span><strong>{row.selected}<small>题</small></strong>
      <i aria-hidden="true"><b style={{ width: `${preview.itemCount ? row.selected / preview.itemCount * 100 : 0}%` }} /></i></div>)}</div>
    <p className="studio-footnote">保持能力需要真实间隔后的新题证据，本组题量不等于已经验证的能力。</p>
    <VerificationObservationPlan verification={preview.blueprint.verification} names={names} />
    {preview.teachingOrigin&&<p className="studio-footnote">采用原课程教学稿第 {preview.teachingOrigin.contentVersion} 版。独立检查由孩子本人作答；保持核查从指导计划的真实到期任务开始。</p>}
    {preview.blueprint.teachingCoverage&&<details className="blueprint-coverage"><summary>逐目标查看理解、执行、迁移与保持的安排</summary><ul>{preview.blueprint.teachingCoverage.map(row=><li key={row.atomId+':'+row.purpose} data-gap={row.selected<row.required}><div><strong>{names.get(row.atomId)??row.atomId} · {dimensionNames[row.purpose]}</strong><small>本组 {row.selected} / 需 {row.required} 题；原材料当前可用 {row.available} 题</small>{gapKind(row)&&<p data-gap-kind={gapKind(row)!}>{gapText(row)}</p>}</div><span>{row.selected>=row.required?'已安排':gapKind(row)==='deferred'?'下一组继续':'需补材料'}</span></li>)}</ul></details>}
    <div className="blueprint-coverage"><h3>这次观察哪些知识点</h3><ul>{preview.coverage.map(point => <li key={point.atomId} data-gap={point.selected < point.required}>
      <div><strong>{names.get(point.atomId) ?? point.atomId}</strong><small>{point.role === 'prerequisite' ? '前置基础核查' : '已学范围'} · 本组{point.selected}题</small>
        {teaching ? pointGaps(teaching, point.atomId).map(gap => <p key={gap.kind} data-gap-kind={gap.kind}>{gap.text}</p>) : point.missingReason && <p>{point.missingReason}</p>}</div><span>{point.selected >= point.required ? '已安排' : point.selected ? '仍需补证据' : '本次未覆盖'}</span>
    </li>)}</ul></div>
    {!!(gapNotices.length || preview.blueprint.warnings.length) && <div className="blueprint-notices" role="status">{[...gapNotices, ...preview.blueprint.warnings].map(warning => <p key={warning}>{warning}</p>)}</div>}
    {preview.expired && !preview.sessionId && <p className="studio-error" role="status">这份题组预览已过期，请重新确认范围后查看。</p>}
    {!preview.itemCount && <div className="studio-hint"><strong>当前范围暂缺可用的评测题。</strong><p>已保留具体覆盖缺口。可返回核对学习范围，或请教研补充并审核题目后再试。</p></div>}
    <div className="blueprint-actions"><button className="studio-primary" disabled={busy || !preview.canStart} onClick={onStart}>
      {busy ? '正在准备…' : preview.sessionId ? '继续已经开始的评测 →' : '准备好了，开始这一组 →'}</button>
      <button className="studio-text-button" disabled={busy} onClick={onBack}>返回范围，重新查看</button></div>
    <p className="studio-footnote">本次最多{preview.blueprint.itemLimit}题，预计时间预算{preview.blueprint.minutesLimit}分钟。达到题量、时间或可用题族范围即停止选题；提前结束会保留已答表现，未答内容继续保持未知。</p>
  </section>;
}
