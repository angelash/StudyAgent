'use client';
import * as React from 'react';
import type { DiagnosticHypothesis, DiagnosticReport, GuidancePlanView, MasteryEstimate } from '@study-agent/contracts';
import { AnswerEvidenceView } from './answer-evidence-view';
import { EvidenceFeedbackForm } from './evidence-feedback';
import { ComponentObservations, DiagnosticEvidence, DiagnosticEvidenceReferences, ObservedPerformance } from './diagnostic-evidence';
import { ReportPlanPath, type ReportPlanRead } from './report-plan-path';
import './knowledge-report-workspace.css';

const statusLabels: Record<MasteryEstimate['status'], string> = { unknown: '尚未测量', insufficient: '证据待补充', learning: '继续巩固', fragile: '还需验证', secure: '证据较稳定' };
const hypothesisLabels: Record<DiagnosticHypothesis['status'], string> = { proposed: '待验证', testing: '验证中', supported: '现有证据支持继续核查', contradicted: '已有反证', inconclusive: '证据不一致', monitoring: '持续观察', resolved: '后续验证已通过', reopened: '需要再次核查', withdrawn: '原依据已撤回' };
const dimensions = [['understanding', '理解'], ['procedure', '操作'], ['transfer', '迁移'], ['retention', '保持']] as const;
const percent = (value: number | null | undefined) => value !== null && value !== undefined && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;

export function KnowledgeReportWorkspace({ ownerId, report, plans, currentPlan, planRead, busy, analysisNeedsUpdate, onRetryPlans, onVerify, onOpenPlan, onAccessLost }: {
  ownerId: string; report: DiagnosticReport; plans: GuidancePlanView[]; currentPlan: GuidancePlanView | null; planRead: ReportPlanRead;
  busy: boolean; analysisNeedsUpdate: boolean; onRetryPlans: () => void; onVerify: (hypothesis?: DiagnosticHypothesis, atomId?: string) => void;
  onOpenPlan?: (plan: GuidancePlanView) => void; onAccessLost: () => void;
}) {
  const points = React.useMemo(() => {
    const rows = new Map<string, { id: string; name: string; estimate?: MasteryEstimate }>();
    for (const estimate of report.estimates) rows.set(estimate.atomId, { id: estimate.atomId, name: estimate.atomName, estimate });
    for (const atom of report.definitionContext?.atoms ?? []) if (!rows.has(atom.id)) rows.set(atom.id, { id: atom.id, name: atom.name });
    for (const row of report.componentObservations ?? []) if (!rows.has(row.atomId)) rows.set(row.atomId, { id: row.atomId, name: row.atomName });
    for (const id of [...report.unmeasuredAtomIds, ...report.hypotheses.map(row => row.atomId)]) if (!rows.has(id)) rows.set(id, { id, name: '历史目标 ' + (rows.size + 1) + '（名称待核对）' });
    return [...rows.values()];
  }, [report]);
  const [selected, setSelected] = React.useState(points[0]?.id ?? ''), [query, setQuery] = React.useState(''), [notice, setNotice] = React.useState('');
  React.useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search), requested = params.get('reportAtom');
      if (params.get('session') !== report.sessionId) return;
      if (requested && points.some(row => row.id === requested)) { setSelected(requested); setNotice(''); }
      else {
        setSelected(points[0]?.id ?? '');
        if (requested) { params.delete('reportAtom'); window.history.replaceState({}, '', '?' + params.toString()); setNotice('链接中的知识点不在这份报告中，已返回本报告的有效目标。'); }
      }
    };
    restore(); window.addEventListener('popstate', restore); return () => window.removeEventListener('popstate', restore);
  }, [report.sessionId, points]);
  const point = points.find(row => row.id === selected) ?? points[0];
  function choose(id: string) {
    if (!points.some(row => row.id === id)) return;
    setSelected(id); setNotice('');
    const params = new URLSearchParams(window.location.search); params.set('studentId', report.studentId); params.set('subject', report.subject); params.set('session', report.sessionId); params.set('reportAtom', id);
    if (params.toString() !== new URLSearchParams(window.location.search).toString()) window.history.pushState({}, '', '?' + params.toString());
  }
  const canVerify = !busy && !analysisNeedsUpdate && report.status === 'completed' && report.definitionContext?.origin !== 'unavailable';
  const visible = points.filter(row => row.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const definition = report.definitionContext?.atoms.find(row => row.id === point?.id), estimate = point?.estimate;
  const mastery = percent(estimate?.mastery), lower = percent(estimate?.lower), upper = percent(estimate?.upper);
  const validRange = mastery !== null && lower !== null && upper !== null && lower <= mastery && mastery <= upper;
  const evidence = report.evidence.filter(row => row.atomId === point?.id), hypotheses = report.hypotheses.filter(row => row.atomId === point?.id);
  const currentIds = new Set(report.evidence.map(row => row.id));
  const historicalIds = estimate?.evidenceIds.filter(id => !currentIds.has(id)) ?? [];
  const selfReports = evidence.filter(row => row.disposition === 'dont_know').length;
  return <section className="knowledge-report" aria-label="知识点工作区"><header className="kr-heading"><div><span>KNOWLEDGE / 一点一点看清</span><h3>知识掌握与证据范围</h3></div><p>选一个知识点，把表现、可能原因和下一步放在一起。</p></header>
    {notice && <p role="status" className="kr-caution">{notice}</p>}
    {!points.length ? <p>这份记录尚没有可核对的知识点，请保留原作答并重新确认学习范围。</p> : <div className="kr-layout"><aside className="kr-directory" aria-label="本报告知识点目录"><label>查找知识点<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="输入知识点名称" /></label><p>{visible.length} / {points.length} 个知识点</p>
      <div className="kr-points">{visible.map(row => <button key={row.id} type="button" aria-label={'查看知识点：' + row.name} aria-pressed={row.id === point.id} onClick={() => choose(row.id)}><strong>{row.name}</strong><span>{row.estimate ? statusLabels[row.estimate.status] : '尚未独立测量'}</span></button>)}</div>
      {!visible.length && <div><p>没有匹配的知识点。当前详情仍保留。</p><button className="studio-text-button" onClick={() => setQuery('')}>清空搜索</button></div>}
    </aside><div className="kr-detail" key={point.id}><header><span className="studio-badge">{estimate ? statusLabels[estimate.status] : '尚未独立测量'}</span><h3>{point.name}</h3></header>
      <section aria-label="本点冻结目标"><h4>当时要测什么</h4>{definition && report.definitionContext?.origin === 'started' ? <><p><strong>目标：</strong>{definition.objective}</p><p><strong>成功标准：</strong>{definition.successCriterion}</p></> : <p>这份历史记录未保留可核对的目标定义。保留当时表现，重新确认范围后再测当前能力。</p>}</section>
      <section aria-label="本点量化与未知项"><h4>目前的证据说明什么</h4><div className="kr-quant"><strong>{mastery === null ? '尚未形成有效估计' : mastery + '%'}</strong><p>{mastery === null ? '未测不等于零分。需要新的独立作答来补充。' : '当前记录的参考估计，继续结合题目表现核对。'}</p></div>
        {validRange ? <><div className="kr-interval" role="img" aria-label={'参考估计' + mastery + '%，区间' + lower + '%至' + upper + '%'}><span style={{ left: lower + '%', width: (upper - lower) + '%' }} /><i style={{ left: mastery + '%' }} /></div><p>参考区间 {lower}% – {upper}%。区间越宽，越需要补充证据。</p></> : mastery !== null && <p>估计区间暂时无法核对。</p>}
        <div className="kr-dimensions">{dimensions.map(([key, label]) => { const row = estimate?.dimensions.find(item => item.dimension === key), value = percent(row?.mastery); return <div key={key}><span>{label}</span><strong>{value === null ? '未测' : value + '%'}</strong></div>; })}</div>
        <p>{estimate?.scoredCount ?? 0} 条计入估计的记录 · {estimate?.independentFamilies ?? 0} 个题族；相同结构的变式合并考虑。</p>
        {selfReports > 0 && <p className="kr-caution">本组有 {selfReports} 次选择暂时不会。现行规则将这类记录计入参考估计，但没有可核对的解题步骤，原因仍需实际作答验证。</p>}
        <p>迁移：{estimate?.transferVerified ? '已有独立验证记录' : '仍需独立新题验证'} · 保持：{estimate?.retentionVerified ? '已有间隔验证记录' : '仍需真实间隔复测'}</p>
      </section>
      <section aria-label="本点表面表现"><h4>这组题里，看到了什么</h4>{evidence.length ? <><p>本组 {evidence.length} 条记录：选择暂时不会 {selfReports} 次，跳过 {evidence.filter(row => row.status === 'skipped' || row.disposition === 'skip').length} 次，表达待复核 {evidence.filter(row => row.status === 'pending_review').length} 次。具体过程按原题核对。</p><details><summary>逐题核对本组 {evidence.length} 条记录</summary>{evidence.map(row => <article className="kr-evidence" key={row.id}><strong>{row.disposition === 'dont_know' ? '选择暂时不会' : row.status === 'pending_review' ? '表达待复核' : row.status === 'skipped' || row.disposition === 'skip' ? '已跳过' : row.correct ? '达到本题标准' : '本题需要核查'}</strong>
        <ObservedPerformance observation={report.observations?.find(item => item.responseId === row.id)} /><p>{row.gradingReason}</p><AnswerEvidenceView answer={row.answer} />
        <p>{row.disposition !== 'answered' ? '未提交可核对的解题过程' : row.priorExposure ? '这道题曾经出现' : row.hintLevel ? '使用了' + row.hintLevel + '级提示' : '本次未使用提示'} · {Math.round(row.elapsedMs / 1000)} 秒</p>
        <DiagnosticEvidence studentId={report.studentId} responseId={row.id} /><EvidenceFeedbackForm kind="diagnostic" responseId={row.id} /></article>)}</details></> : <p>本组尚未留下这个点的作答。历史估计和综合题线索不代替本组实际测量。</p>}
        <DiagnosticEvidenceReferences key={point.id + ':history'} studentId={report.studentId} ids={historicalIds} title="计入估计的其他历史作答" />
      </section>
      {!!report.componentObservations?.some(row => row.atomId === point.id) && <details className="kr-component-details"><summary>核对综合题中的步骤线索</summary><ComponentObservations observations={report.componentObservations.filter(row => row.atomId === point.id)} studentId={report.studentId} busy={!canVerify} onVerify={report.status === 'completed' ? id => onVerify(undefined, id) : undefined} /></details>}
      <section aria-label="本点原因与验证"><h4>可能卡在哪里，以及怎样验证</h4>{hypotheses.length ? hypotheses.map(hypothesis => <article className="kr-hypothesis" key={hypothesis.id}><span className="studio-badge">{hypothesisLabels[hypothesis.status]}</span><h5>{hypothesis.title}</h5><p>{hypothesis.observation}</p><p>{hypothesis.explanation}</p>
        <p>支持方向 {hypothesis.supportingEvidenceIds.length} 条 · 反证 {hypothesis.counterEvidenceIds.length} 条。条数不等于独立题族数。</p>
        <details><summary>核对条件、其他解释和原始依据</summary><p>{hypothesis.nextAction}</p>{hypothesis.verification && <dl className="diagnostic-verification"><dt>哪些表现支持继续核查</dt><dd>{hypothesis.verification.supportCondition}</dd><dt>哪些表现构成反证</dt><dd>{hypothesis.verification.counterCondition}</dd><dt>哪些情况仍然不能下结论</dt><dd>{hypothesis.verification.undecidedCondition}</dd></dl>}
          <ul>{hypothesis.alternatives.map((alternative, index) => <li key={index}>{alternative}</li>)}</ul>
          <DiagnosticEvidenceReferences studentId={report.studentId} ids={hypothesis.supportingEvidenceIds} title="支持方向的依据" /><DiagnosticEvidenceReferences studentId={report.studentId} ids={hypothesis.counterEvidenceIds} title="需要同时核对的反证" /><DiagnosticEvidenceReferences studentId={report.studentId} ids={hypothesis.reportedEvidenceIds ?? []} title="孩子报告暂时不会" />
          {!!hypothesis.probeAtomIds.length && <p>需一起核查的基础：{hypothesis.probeAtomIds.map(id => points.find(row => row.id === id)?.name ?? '基础目标（当时名称待核对）').join('；')}。</p>}
        </details>
        {!!hypothesis.history.length && <details><summary>这条判断怎样变化 · {hypothesis.history.length} 条记录</summary><ol className="kr-cause-history">{hypothesis.history.map((row, index) => <li key={index}><strong>{hypothesisLabels[row.status as DiagnosticHypothesis['status']] ?? '历史判断'}</strong><p>{row.reason}</p><time>{Number.isFinite(Date.parse(row.at)) ? new Date(row.at).toLocaleString('zh-CN') : '时间待核对'}</time></li>)}</ol></details>}
        {hypothesis.cause === 'retention_gap' ? <p>保持情况通过指导计划中的真实间隔复测验证，当天换题不能代替间隔。</p> : !['resolved', 'contradicted', 'withdrawn'].includes(hypothesis.status) && report.status === 'completed' && report.definitionContext?.origin !== 'unavailable' && <button className="studio-secondary" disabled={!canVerify} onClick={() => onVerify(hypothesis)}>做一组题验证原因 ↗</button>}
      </article>) : <p>这份报告没有为本点形成原因假设，不能据此判断没有问题。先补充可观察的独立作答。</p>}
        {analysisNeedsUpdate && <p>先完成报告依据核对，再开始验证。</p>}
        {!hypotheses.length && definition && report.status === 'completed' && report.definitionContext?.origin === 'started' && <button className="studio-secondary" disabled={!canVerify} onClick={() => onVerify(undefined, point.id)}>预览本点的独立题组 ↗</button>}
      </section>
      <ReportPlanPath ownerId={ownerId} report={report} atomId={point.id} plans={plans} currentPlan={currentPlan} read={planRead} onRetry={onRetryPlans} onOpenPlan={onOpenPlan} onAccessLost={onAccessLost} />
    </div></div>}
  </section>;
}
