'use client';
import * as React from 'react';
import Link from 'next/link';
import { objectiveEstimateLabels, type ObjectiveEstimateStatus, type SourceCourseView } from '@study-agent/contracts';
import { workspaceHref } from '../../../lib/workspace-navigation';
import { CourseLessonStatus } from '../course-activity';
import './course-tabs.css';

/**
 * 232 §4.2: AI and source courses use the same five tabs as textbook courses once they are open for learning.
 * The URL values match the textbook course page (`?panel=`); unknown values fall back to 单元.
 */
export type SourceCoursePanel = 'materials' | 'baseline' | 'outline' | 'practices' | 'checks';
export const sourceCoursePanels: readonly SourceCoursePanel[] = ['materials', 'baseline', 'outline', 'practices', 'checks'];
const names: Record<SourceCoursePanel, string> = { materials: '资料', baseline: '摸底', outline: '单元', practices: '练习', checks: '验证' };
export function restoreSourceCoursePanel(value: string | null): SourceCoursePanel {
  return sourceCoursePanels.find(panel => panel === value) ?? 'outline';
}

/** Without `enabled` (generation and review stages) the children render as one page, without tabs. */
export function SourceCourseTabs({ enabled, value, onChange, children }: {
  enabled: boolean; value: SourceCoursePanel; onChange: (panel: SourceCoursePanel) => void; children: React.ReactNode;
}) {
  const id = React.useId(), tabs = React.useRef<Array<HTMLButtonElement | null>>([]);
  if (!enabled) return <>{children}</>;
  function navigate(event: React.KeyboardEvent, index: number) {
    const count = sourceCoursePanels.length;
    const next = event.key === 'ArrowRight' ? (index + 1) % count : event.key === 'ArrowLeft' ? (index + count - 1) % count
      : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : null;
    if (next === null) return;
    event.preventDefault(); onChange(sourceCoursePanels[next]); tabs.current[next]?.focus();
  }
  return <>
    <div className="cl-course-tabs sc-course-tabs" role="tablist" aria-label="课程面板">
      {sourceCoursePanels.map((panel, index) => <button key={panel} type="button" role="tab" id={id + '-tab-' + panel}
        ref={node => { tabs.current[index] = node; }} aria-selected={value === panel} aria-controls={id + '-panel'}
        tabIndex={value === panel ? 0 : -1} onKeyDown={event => navigate(event, index)} onClick={() => onChange(panel)}>{names[panel]}</button>)}
    </div>
    <div id={id + '-panel'} className="sc-course-panel" role="tabpanel" aria-labelledby={id + '-tab-' + value}>{children}</div>
  </>;
}

const estimateOrder: ObjectiveEstimateStatus[] = ['likely_met', 'needs_practice', 'insufficient', 'not_attempted'];

/** 摸底: what the blueprint started from, and where the estimate tier stands before learning. Read-only. */
export function SourceCourseBaselinePanel({ row }: { row: SourceCourseView }) {
  const objectives = row.journey?.objectives ?? [], planned = row.plannedFrom;
  const counts = objectives.reduce<Record<string, number>>((sum, item) => ({ ...sum, [item.status]: (sum[item.status] ?? 0) + 1 }), {});
  const context = row.studentId && row.subject ? { studentId: row.studentId, subject: row.subject } : null;
  const groups = planned ? ([['稳固', planned.secure], ['不稳固', planned.fragile], ['学习中', planned.learning]] as const) : [];
  return <section className="sc-loop-panel" aria-label="课程摸底">
    <header><small>BASELINE · 摸底</small><h2>摸底：从哪里讲起</h2></header>
    {planned ? <div className="sc-loop-block"><h3>蓝图参考的正式测量</h3><p>{planned.notice}</p>
      {groups.filter(([, items]) => items.length).map(([label, items]) => <p key={label}><b>{label}：</b>{items.join('、')}</p>)}
      <small>测量时间：{new Date(planned.measuredAt).toLocaleString('zh-CN')}</small></div>
      : <p className="sc-loop-empty">{!row.studentId ? '这门课没有绑定学习档案，生成时没有正式测量可参考，蓝图按课程目标从头编排。'
        : !row.permissions.manage ? '蓝图参考的测量结果只对课程创建者显示。'
          : '生成这门课时还没有可参考的正式测量结果，蓝图按课程目标从头编排。'}</p>}
    <div className="sc-loop-block"><h3>开课起点（估计）</h3>
      <p>AI 课程暂不单独出开课前短测。各课随堂题的首次作答就是起点估计，只按课时目标汇总，不进入知识点掌握度。</p>
      {objectives.length ? <ul className="sc-loop-counts">{estimateOrder.map(status => <li key={status} data-status={status}>
        <b>{counts[status] ?? 0}</b><span>{objectiveEstimateLabels[status]}</span></li>)}</ul>
        : <p className="sc-loop-empty">这门课还没有可汇总的课时目标。</p>}
    </div>
    {context && <Link className="sc-loop-link" href={workspaceHref('assessment', context)}>打开知识诊断（正式测量）→</Link>}
  </section>;
}

/** 练习: each lesson's classroom practice in one list, plus the course project. Opens the existing pages only. */
export function SourceCoursePracticePanel({ row, practiceHref, children }: {
  row: SourceCourseView; practiceHref: (lessonId: string, sessionId?: string) => string; children?: React.ReactNode;
}) {
  return <section className="sc-loop-panel" aria-label="课程练习">
    <header><small>PRACTICE · 练习</small><h2>练习：每课随堂题</h2>
      <p>首次作答原样保留，提示后答对按一半计入课程目标估计；不算作正式掌握。</p></header>
    {row.status !== 'active' ? <p className="sc-loop-empty">课程已归档，不能开始新的练习；原有作答仍保留在各课课堂记录中。</p> :
      <ol className="sc-loop-practices">{row.lessons.map((lesson, index) => {
        const activity = row.journey?.lessons.find(item => item.lessonId === lesson.id);
        return <li key={lesson.id}><div><small>LESSON {String(index + 1).padStart(2, '0')}</small><b>{lesson.title}</b>
          <span>{lesson.questions.length} 道随堂题</span></div><CourseLessonStatus value={activity}/>
          <Link href={practiceHref(lesson.id, activity?.practice.sessionId ?? undefined)}>
            {activity?.practice.sessionId ? '继续练习 →' : '进入课堂练习 →'}</Link></li>;
      })}</ol>}
    {children}
  </section>;
}
