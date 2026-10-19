'use client';
import type { QuestionAnswerSchema } from '@study-agent/contracts';
import { answerInputConfiguration } from '@study-agent/contracts';
import { StudentMediaEvidence } from './media-answer-input';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const display = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '未填写';
  if (typeof value !== 'object') return String(value);
  try { return JSON.stringify(value).slice(0, 20000); } catch { return '此历史作答需核查'; }
};
/** Read-only evidence, including saved binary work and actual strokes; never exposes a new editable answer widget. */
export function AnswerEvidenceView({ answer, schema }: { answer: unknown; schema?: QuestionAnswerSchema }) {
  const envelope = record(answer), response = 'response' in envelope ? record(envelope.response) : envelope;
  const mode = schema?.mode ?? envelope.mode;
  const config = schema ? answerInputConfiguration(schema) : null;
  if (Array.isArray(response.mediaIds)) return <div>{response.mediaIds.slice(0, 3).filter((id): id is string => typeof id === 'string' && /^student_media_[a-f0-9-]{36}$/.test(id)).map(id => <StudentMediaEvidence key={id} id={id} />)}{typeof response.description === 'string' && <p>{response.description}</p>}</div>;
  if (mode === 'geometry_draw' || Array.isArray(response.strokes)) {
    const strokes = Array.isArray(response.strokes) ? response.strokes.slice(0, 64).flatMap(stroke => {
      const item = record(stroke); if (!Array.isArray(item.points)) return [];
      const points = item.points.slice(0, 1024).map(record).filter(p => typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
      return points.length ? [points] : [];
    }) : [];
    return <div>{strokes.length > 0 && <svg viewBox="0 0 640 420" className="saved-drawing-evidence" role="img" aria-label="孩子提交时保存的作图笔迹"><title>保存的作图证据</title>{strokes.map((points, index) => points.length === 1 ? <circle key={index} cx={Number(points[0].x) * 640} cy={Number(points[0].y) * 420} r="2" fill="#244d40" /> : <polyline key={index} points={points.map(p => `${Number(p.x) * 640},${Number(p.y) * 420}`).join(' ')} fill="none" stroke="#244d40" strokeWidth="3" />)}</svg>}{typeof response.description === 'string' && <p>{response.description}</p>}</div>;
  }
  if (mode === 'stepwise') { const steps = Array.isArray(response.steps) ? response.steps : Array.isArray(answer) ? answer : []; return <ol>{steps.slice(0, 80).map((step, index) => <li key={index}>{display(step)}</li>)}</ol>; }
  if (config && mode === 'matching' && Array.isArray(response.pairs)) return <dl>{response.pairs.slice(0, 80).map((pair, index) => { const entry = record(pair); return <div key={index}><dt>{config.left.find(c => c.id === entry.left)?.label ?? display(entry.left)}</dt><dd>{config.right.find(c => c.id === entry.right)?.label ?? display(entry.right)}</dd></div>; })}</dl>;
  if (config && mode === 'sorting' && Array.isArray(response.values)) return <ol>{response.values.slice(0, 80).map((value, index) => <li key={index}>{config.items.find(c => c.id === value)?.label ?? display(value)}</li>)}</ol>;
  if (config && mode === 'drag_drop') return <dl>{Object.entries(record(response.placements)).slice(0, 80).map(([key, value]) => <div key={key}><dt>{config.items.find(c => c.id === key)?.label ?? key}</dt><dd>{config.groups.find(c => c.id === value)?.label ?? display(value)}</dd></div>)}</dl>;
  if (config && mode === 'table_fill') { const cells = record(response.cells); return <dl>{config.rows.flatMap(row => config.columns.map(column => <div key={`${row.id}:${column.id}`}><dt>{row.label} · {column.label}</dt><dd>{display(cells[`${row.id}:${column.id}`])}</dd></div>))}</dl>; }
  if (Array.isArray(response.entries)) return <dl>{response.entries.slice(0, 80).map((entry, index) => { const value = record(entry); return <div key={index}><dt>{typeof value.label === 'string' ? value.label : `第${index + 1}空`}</dt><dd>{display(value.value)}</dd></div>; })}</dl>;
  if ('value' in response) return <p style={{ whiteSpace: 'pre-wrap' }}>{config ? config.items.find(c => c.id === response.value)?.label ?? display(response.value) : display(response.value)}</p>;
  return <p style={{ whiteSpace: 'pre-wrap' }}>{display(answer)}</p>;
}
