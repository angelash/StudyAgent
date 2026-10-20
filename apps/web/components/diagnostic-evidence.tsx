'use client';
import * as React from 'react';
import type { ComponentObservation, DiagnosticObservation, DiagnosticResponse, KnowledgeAtom, LearningScope, MeasurementItem, QuestionRenderPayload, ScoringRevision } from '@study-agent/contracts';
import { apiRequest } from '../lib/api';
import { AnswerEvidenceView } from './answer-evidence-view';
import { EvidenceFeedbackForm } from './evidence-feedback';
import { QuestionFaceView } from './question-face-view';
import './diagnostic-evidence.css';

type Detail = { response: DiagnosticResponse; originalResponse: DiagnosticResponse; observation: DiagnosticObservation; componentObservations?: ComponentObservation[];
  payload: QuestionRenderPayload | null; stem: string; referenceAnswer: unknown; analysis: string; mapping: MeasurementItem;
  scopeSnapshot: LearningScope; atomSnapshot: KnowledgeAtom | null; revisions: Array<Pick<ScoringRevision, 'version' | 'score' | 'reason' | 'createdAt' | 'ratings' | 'rubricSnapshot'>> };

export function ObservedPerformance({ observation }: { observation?: DiagnosticObservation }) {
  if (!observation) return null;
  return <div className="diagnostic-observation"><p>{observation.description}</p>{!!observation.details.length && <ul>{observation.details.map(detail => <li key={detail.key}><strong>{detail.label}</strong> · {detail.score === 1 ? '达到本项标准' : detail.score === 0 ? '本项未达到标准' : `本项得分 ${Math.round(detail.score * 100)}%`}{detail.observation && <p>{detail.observation}</p>}</li>)}</ul>}</div>;
}

const componentStates: Record<ComponentObservation['state'], string> = { meets_standard: '本题这一步达到标准', below_standard: '这一步需要单独核查',
  upstream_unverified: '先核对前一步', assisted_or_exposed: '需要换新题独立核查', not_observed: '还没有可核对的步骤', definition_unverified: '目标需要重新核对' };

export function ComponentObservations({ observations = [], studentId, busy = false, onVerify }: { observations?: ComponentObservation[]; studentId?: string;
  busy?: boolean; onVerify?: (atomId: string) => void }) {
  if (!observations.length) return null;
  const atoms = [...new Set(observations.map(row => row.atomId))];
  return <section className="component-observations" aria-label="综合题中的具体步骤"><h3>把这一步单独看清。</h3>
    <p>综合题的步骤提供线索。这个知识点的掌握情况，由独立题组继续测量。</p>
    {atoms.map(atomId => { const rows = observations.filter(row => row.atomId === atomId);
      return <article key={atomId}><h4>{rows[0].atomName}</h4>{rows.map(row => <div className="component-observation" key={`${row.responseId}:${row.bindingId}`}>
        <strong>{componentStates[row.state]}</strong><p>{row.description}</p>
        {!!row.upstreamDetails.length && <p>先核对：{row.upstreamDetails.map(detail => `${detail.label}（${detail.score === 1 ? '达标' : '未达标'}）`).join('；')}</p>}
        {!!row.scoreDetails.length && <p>对应步骤：{row.scoreDetails.map(detail => `${detail.label}（${detail.score === 1 ? '达标' : '未达标'}）`).join('；')}</p>}
        <p>{row.nextAction}</p>{studentId && <DiagnosticEvidence studentId={studentId} responseId={row.responseId} label="核对这道综合题与当时回答" />}
      </div>)}{onVerify && rows.some(row => row.state !== 'definition_unverified') && <><button className="studio-secondary" disabled={busy} onClick={() => onVerify(atomId)}>预览这个步骤的独立题组 ↗</button><p>题组会列出需要核查的基础内容，确认范围后再开始。</p></>}</article>;
    })}
  </section>;
}

export function DiagnosticEvidence({ studentId, responseId, label = '展开当时题目与作答' }: { studentId: string; responseId: string; label?: string }) {
  const [open, setOpen] = React.useState(false), [detail, setDetail] = React.useState<Detail | null>(null), [error, setError] = React.useState(''), [retry, setRetry] = React.useState(0);
  React.useEffect(() => {
    if (!open) return; let alive = true; setDetail(null); setError('');
    apiRequest<Detail>(`/diagnostics/students/${encodeURIComponent(studentId)}/evidence/${encodeURIComponent(responseId)}`)
      .then(next => { if (alive) setDetail(next); }).catch(caught => { if (alive) setError(caught instanceof Error ? caught.message : '证据暂时未能打开'); });
    return () => { alive = false; };
  }, [studentId, responseId, open, retry]);
  return <details className="diagnostic-evidence" open={open} onToggle={event => setOpen(event.currentTarget.open)}><summary>{label}</summary>
    {open && !detail && !error && <p role="status">正在读取当时的题目、范围与评分…</p>}
    {error && <div role="alert"><p>{error}</p><button className="studio-secondary" onClick={() => setRetry(value => value + 1)}>重新读取</button></div>}
    {detail && <div><p className="diagnostic-evidence-source">{detail.atomSnapshot?.name ?? detail.mapping.atomId} · {new Date(detail.response.submittedAt).toLocaleString('zh-CN')} · {detail.scopeSnapshot.grade}年级 · {detail.scopeSnapshot.textbookVersion}</p>
      <QuestionFaceView payload={detail.payload} stem={detail.stem} /><h5>孩子提交的回答</h5><AnswerEvidenceView answer={detail.response.answer} schema={detail.payload?.answerSchema} />
      <ObservedPerformance observation={detail.observation} /><p>{detail.response.gradingReason}</p>
      <ComponentObservations observations={detail.componentObservations} />
      <p>{detail.response.disposition === 'dont_know' ? '选择暂时不会，没有提交解题过程。' : detail.response.disposition === 'skip' ? '跳过本题。' : detail.response.hintLevel ? `使用了${detail.response.hintLevel}级提示。` : '本次作答未使用提示。'}{detail.response.priorExposure && '这道题曾在学习活动中出现，不计独立新题证据。'}耗时 {Math.round(detail.response.elapsedMs / 1000)} 秒；耗时本身不能确定能力原因。</p>
      {!!detail.revisions.length && <details><summary>原分与评分修订</summary><p>首次评分：{detail.originalResponse.score === null ? '尚未评分' : `${Math.round(detail.originalResponse.score * 100)}%`}。{detail.originalResponse.gradingReason}</p>{detail.revisions.map(revision => <div key={revision.version}><p>第{revision.version}次复核 · {new Date(revision.createdAt).toLocaleString('zh-CN')} · {Math.round(revision.score * 100)}%</p><p>{revision.reason}</p></div>)}</details>}
      <details><summary>参考答案与思路</summary><AnswerEvidenceView answer={detail.referenceAnswer} schema={detail.payload?.answerSchema} /><p>{detail.analysis}</p></details>
      <EvidenceFeedbackForm kind="diagnostic" responseId={responseId} />
    </div>}
  </details>;
}

export function DiagnosticEvidenceReferences({ studentId, ids, title }: { studentId: string; ids: string[]; title: string }) {
  const [visible, setVisible] = React.useState(6);
  if (!ids.length) return null;
  return <section className="diagnostic-references" aria-label={title}><h5>{title} · {ids.length} 条</h5>{ids.slice(0, visible).map((id, index) => <DiagnosticEvidence key={id} studentId={studentId} responseId={id} label={`${title} ${index + 1}：核对原题与当时表现`} />)}{ids.length > visible && <button className="studio-secondary" onClick={() => setVisible(value => value + 6)}>继续查看后续依据</button>}</section>;
}
