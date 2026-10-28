'use client';
import * as React from 'react';
import Link from 'next/link';
import type { ChemistryCatalog, ChemistryCheckpoint } from '@study-agent/contracts';
import { apiRequest } from '../../lib/api';
import './course-assessments.css';

const statusNames: Record<ChemistryCheckpoint['status'], string> = {
  not_started: '未开始', in_progress: '正在作答', paused: '已暂停', completed: '已完成', aborted: '已结束'
};
const errorText = (error: unknown) => error instanceof Error ? error.message : '操作暂未完成，请重试';

export function ChemistryEnrollment({ catalog, onChanged }: { catalog: ChemistryCatalog; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  const requestKey = React.useRef('');
  if (catalog.courseId) return null;
  const child = catalog.children.find(child => child.id === catalog.studentId);
  async function enroll() {
    if (busy || !catalog.canEnroll || !catalog.studentId) return;
    setBusy(true); setError('');
    try {
      requestKey.current ||= crypto.randomUUID();
      await apiRequest('/chemistry/enroll', { method: 'POST', body: JSON.stringify({
        studentId: catalog.studentId, version: catalog.version, requestKey: requestKey.current
      }) });
      await onChanged();
    } catch (caught) { setError(errorText(caught)); } finally { setBusy(false); }
  }
  return <section className="cl-course-enrollment" aria-label="添加课程">
    <div><strong>把这门课加入学习计划</strong><p>添加后保存到{child?.nickname ?? '当前学习档案'}，从课前诊断开始学习。</p>
      {child?.grade !== 9 ? <p>请在顶部选择九年级档案，或到<Link href="/parent/dashboard?subject=chemistry">家长空间添加档案</Link>。</p>
        : !catalog.canEnroll && <p>请由监护人添加这门课程。</p>}
      <small>添加课程只建立计划，讲解、作答与复测进度分别记录。</small></div>
    <button className="cl-course-action" disabled={busy || !catalog.canEnroll} onClick={() => void enroll()}>{busy ? '正在添加…' : '添加课程并开始学习'}</button>
    {error && <p role="alert">{error}</p>}
  </section>;
}

function Checkpoint({ catalog, check }: { catalog: ChemistryCatalog; check: ChemistryCheckpoint }) {
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  const requestKey = React.useRef('');
  const href = (session: string) => '/student/assessment?' + new URLSearchParams({ studentId: catalog.studentId!, subject: 'chemistry', session });
  async function start() {
    if (busy || !check.ready || !catalog.studentId) return;
    setBusy(true); setError('');
    try {
      requestKey.current ||= crypto.randomUUID();
      const result = await apiRequest<{ href: string }>('/chemistry/checkpoints/start', { method: 'POST', body: JSON.stringify({
        studentId: catalog.studentId, version: catalog.version, checkpointId: check.id, requestKey: requestKey.current
      }) });
      window.location.assign(result.href);
    } catch (caught) { setError(errorText(caught)); setBusy(false); }
  }
  return <article className="cl-course-check" data-checkpoint={check.id}>
    <div><small>{statusNames[check.status]}</small><h3>{check.title}</h3><p>{check.targetAtomIds.length} 个目标 · 最多 {check.itemLimit} 题 · 约 {check.minutes} 分钟</p></div>
    {check.lastSessionId && check.status !== 'aborted'
      ? <Link className="cl-course-action" href={href(check.lastSessionId)}>{check.status === 'completed' ? '查看报告与补练' : '继续作答'}</Link>
      : <button className="cl-course-action" disabled={busy || !check.ready} onClick={() => void start()}>{busy ? '正在准备…' : check.kind === 'baseline' ? '开始课前诊断' : '开始独立考核'}</button>}
    {check.reason && <p className="cl-check-reason">{check.reason}</p>}{error && <p role="alert">{error}</p>}
  </article>;
}

export function ChemistryCheckpoints({ catalog, unitId, kind }: { catalog: ChemistryCatalog; unitId: string; kind: 'baseline' | 'unit' | 'all' }) {
  const unitChecks = catalog.checkpoints.filter(check => check.unitIds.includes(unitId) &&
    (kind === 'all' ? check.kind === 'baseline' || check.kind === 'unit' : check.kind === kind));
  return <div className="cl-course-checks">
    {unitChecks.map(check => <Checkpoint key={catalog.studentId + ':' + check.id} catalog={catalog} check={check}/>)}
    {kind === 'all' && <>
      <header className="cl-check-heading"><h2>期中与期末考核</h2><p>完成对应单元考核后开放。分场覆盖相应单元，每场单独保存作答和报告。</p></header>
      {catalog.checkpoints.filter(check => check.kind === 'midterm' || check.kind === 'final').map(check => <Checkpoint key={catalog.studentId + ':' + check.id} catalog={catalog} check={check}/>)}
      <section className="cl-card"><h3>补练与间隔复测</h3><p>从考核报告核查错因、确认指导计划并补练；今日学习显示实际到期的1、3、7、14天复测。</p>
        <Link href={'/student/today?' + new URLSearchParams({ studentId: catalog.studentId ?? '', subject: 'chemistry' })}>查看补练和到期复测 →</Link></section>
    </>}
  </div>;
}

export function ChemistryReferences({ catalog }: { catalog: ChemistryCatalog }) {
  return <section className="cl-card cl-course-references"><h2>教材与广州原卷</h2><p>按现有审核状态开放，可用于综合练习与人工核对。</p>
    <details className="cl-textbook-basis"><summary>查看28节课的教材课题对照</summary><p>{catalog.textbookBasis.title}</p><p>{catalog.textbookBasis.editionNotice}</p>
      <p>图示、模型和随堂题为原创；纯度及氢能定量部分标为拓展。参考本页码用于查阅，不代表学校当前进度。</p>
      <div className="cl-table-wrap"><table><thead><tr><th>本课图示主题</th><th>参考本课题</th><th>印刷页</th></tr></thead><tbody>{catalog.textbookBasis.mappings.map(item => <tr key={item.atomId}>
        <td>{item.lesson}</td><td>{item.topic}</td><td>{item.printedPages[0]}–{item.printedPages[1]}</td></tr>)}</tbody></table></div>
      <a href={catalog.textbookBasis.href} target="_blank" rel="noreferrer">查看参考本来源 ↗</a></details>
    <ul>{catalog.references.map(reference => <li key={reference.id}><a href={reference.href}
      {...(reference.href.startsWith('https:') ? { target: '_blank', rel: 'noreferrer' } : {})}>{reference.title} ↗</a><small>{reference.status === 'published' ? '已开放' : '参考资料'}</small></li>)}</ul>
    <details><summary>课程范围与使用说明</summary>{catalog.notices.map(notice => <p key={notice}>{notice}</p>)}</details>
  </section>;
}
