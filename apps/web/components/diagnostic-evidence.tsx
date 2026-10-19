'use client';
import * as React from 'react';
import type { DiagnosticObservation, DiagnosticResponse, KnowledgeAtom, LearningScope, MeasurementItem, QuestionRenderPayload, ScoringRevision } from '@study-agent/contracts';
import { apiRequest } from '../lib/api';
import { AnswerEvidenceView } from './answer-evidence-view';
import { EvidenceFeedbackForm } from './evidence-feedback';
import { QuestionFaceView } from './question-face-view';
import './diagnostic-evidence.css';

type Detail = { response: DiagnosticResponse; originalResponse: DiagnosticResponse; observation: DiagnosticObservation;
  payload: QuestionRenderPayload | null; stem: string; referenceAnswer: unknown; analysis: string; mapping: MeasurementItem;
  scopeSnapshot: LearningScope; atomSnapshot: KnowledgeAtom | null; revisions: Array<Pick<ScoringRevision, 'version' | 'score' | 'reason' | 'createdAt' | 'ratings' | 'rubricSnapshot'>> };

export function ObservedPerformance({ observation }: { observation?: DiagnosticObservation }) {
  if (!observation) return null;
  return <div className="diagnostic-observation"><p>{observation.description}</p>{!!observation.details.length && <ul>{observation.details.map(detail => <li key={detail.key}><strong>{detail.label}</strong> · {detail.score === 1 ? '达到本项标准' : detail.score === 0 ? '本项未达到标准' : `本项得分 ${Math.round(detail.score * 100)}%`}{detail.observation && <p>{detail.observation}</p>}</li>)}</ul>}</div>;
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
