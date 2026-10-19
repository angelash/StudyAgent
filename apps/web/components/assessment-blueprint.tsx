'use client';

import type { DiagnosticBlueprintView } from '@study-agent/contracts';
import { VerificationObservationPlan } from './verification-observations';
import './assessment-blueprint.css';

const dimensionNames = { understanding: '理解', procedure: '执行', transfer: '迁移', retention: '保持' };

export function AssessmentBlueprintCard({ preview, busy, onStart, onBack }: {
  preview: DiagnosticBlueprintView; busy: boolean; onStart: () => void; onBack: () => void;
}) {
  const names = new Map(preview.atomNames.map(atom => [atom.id, atom.name]));
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
    <div className="blueprint-coverage"><h3>这次观察哪些知识点</h3><ul>{preview.coverage.map(point => <li key={point.atomId} data-gap={point.selected < point.required}>
      <div><strong>{names.get(point.atomId) ?? point.atomId}</strong><small>{point.role === 'prerequisite' ? '前置基础核查' : '已学范围'} · 本组{point.selected}题</small>
        {point.missingReason && <p>{point.missingReason}</p>}</div><span>{point.selected >= point.required ? '已安排' : point.selected ? '仍需补证据' : '本次未覆盖'}</span>
    </li>)}</ul></div>
    {!!preview.blueprint.warnings.length && <div className="blueprint-notices" role="status">{preview.blueprint.warnings.map(warning => <p key={warning}>{warning}</p>)}</div>}
    {preview.expired && !preview.sessionId && <p className="studio-error" role="status">这份题组预览已过期，请重新确认范围后查看。</p>}
    {!preview.itemCount && <div className="studio-hint"><strong>当前范围暂缺可用的评测题。</strong><p>已保留具体覆盖缺口。可返回核对学习范围，或请教研补充并审核题目后再试。</p></div>}
    <div className="blueprint-actions"><button className="studio-primary" disabled={busy || !preview.canStart} onClick={onStart}>
      {busy ? '正在准备…' : preview.sessionId ? '继续已经开始的评测 →' : '准备好了，开始这一组 →'}</button>
      <button className="studio-text-button" disabled={busy} onClick={onBack}>返回范围，重新查看</button></div>
    <p className="studio-footnote">本次最多{preview.blueprint.itemLimit}题，预计时间预算{preview.blueprint.minutesLimit}分钟。达到题量、时间或可用题族范围即停止选题；提前结束会保留已答表现，未答内容继续保持未知。</p>
  </section>;
}
