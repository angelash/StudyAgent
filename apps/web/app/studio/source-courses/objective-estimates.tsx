'use client';
import { objectiveEstimateLabels, OBJECTIVE_ESTIMATE_MIN_ANSWERS, type SourceCourseView } from '@study-agent/contracts';
import './objective-estimates.css';

/** 232 §3.3 estimate tier: one row per lesson objective, kept apart from formal knowledge-point mastery. */
export function SourceCourseObjectiveEstimates({ row }: { row: SourceCourseView }) {
  const objectives = row.journey?.objectives ?? [];
  if (!objectives.length) return null;
  const titles = new Map(row.lessons.map(lesson => [lesson.id, lesson.title]));
  return <section className="sc-objective-estimates" aria-label="课程目标（估计）">
    <header><small>ESTIMATE · 估计</small><h3>课程目标（估计）</h3>
      <p>按每课随堂题的首次作答估计，提示后答对按一半计。至少 {OBJECTIVE_ESTIMATE_MIN_ANSWERS} 题才给出估计。这是 AI 课程的估计结果，不是知识点掌握度，也不进入正式测量。</p></header>
    <ol>{objectives.map(item => <li key={item.lessonId} data-status={item.status}>
      <div><b>{titles.get(item.lessonId) ?? item.lessonId}</b><span>{item.objective}</span></div>
      <strong>{objectiveEstimateLabels[item.status]}</strong>
      <small>{item.answered ? `已答 ${item.answered}/${item.total} · 独立答对 ${item.independentCorrect}` : `共 ${item.total} 题`}</small>
    </li>)}</ol>
  </section>;
}
