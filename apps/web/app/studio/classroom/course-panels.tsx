'use client';
import * as React from 'react';
import Link from 'next/link';
import type { ClassroomCatalog } from '@study-agent/contracts';

export type CoursePanel = 'units' | 'materials' | 'practices';
const panels: CoursePanel[] = ['units', 'materials', 'practices'];
const titles = ['单元', '资料', '练习'];

/** These panels navigate existing activities. They never create learning evidence. */
export function CoursePanels({ catalog, panel, unitIndex, busy, onPanel, onUnit, onPractice, projectHref }: {
  catalog: ClassroomCatalog | null; panel: CoursePanel; unitIndex: number; busy: boolean;
  onPanel: (panel: CoursePanel) => void; onUnit: (index: number) => void;
  onPractice: (lessonId: string, unitIndex: number, sessionId?: string) => void;
  projectHref: (unitIndex: number) => string;
}) {
  const id = React.useId(), tabs = React.useRef<Array<HTMLButtonElement | null>>([]);
  function navigate(event: React.KeyboardEvent, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % panels.length
      : event.key === 'ArrowLeft' ? (index + panels.length - 1) % panels.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? panels.length - 1 : null;
    if (next === null) return;
    event.preventDefault(); onPanel(panels[next]); tabs.current[next]?.focus();
  }
  const units = catalog?.course.units ?? [];
  function practice(lesson: { id: string; title: string }, index: number, kind = 'Practice') {
    const saved = catalog?.lessonActivities?.find(row => row.lessonId === lesson.id)?.practice;
    return <button key={lesson.id} type="button" className="cl-panel-activity" disabled={busy}
      onClick={() => onPractice(lesson.id, index, saved?.sessionId ?? undefined)}>
      <img src={'/reference/hyperknow/components/courseTypeIcon/' + (kind === 'Practice' ? 'chalkboard.svg' : 'exam.svg')} alt=""/>
      <span><b>{lesson.title}</b><small>单元 {index + 1} · {kind}</small>
        {Boolean(saved?.summary.answered) && <small>原首次作答 {saved!.summary.answered}/{saved!.summary.total}</small>}</span>
    </button>;
  }
  return <div className="cl-course-panels">
    <div className="cl-panel-label">面板</div>
    <div className="cl-course-tabs" role="tablist" aria-label="课程面板">
      {panels.map((value, index) => <button key={value} type="button" role="tab" id={id + '-tab-' + value}
        ref={node => { tabs.current[index] = node; }} aria-selected={panel === value}
        aria-controls={id + '-panel-' + value} tabIndex={panel === value ? 0 : -1}
        onKeyDown={event => navigate(event, index)} onClick={() => onPanel(value)}>{titles[index]}</button>)}
    </div>
    <div id={id + '-panel-units'} role="tabpanel" aria-labelledby={id + '-tab-units'} hidden={panel !== 'units'} tabIndex={0}>
      <div className="cl-unit-nav">{units.map((unit, index) => <button key={unit.id} type="button"
        aria-current={unitIndex === index ? 'page' : undefined} data-active={unitIndex === index} onClick={() => onUnit(index)}>
        <b>{index + 1}</b><span>{unit.title}</span></button>)}</div>
    </div>
    <div id={id + '-panel-materials'} role="tabpanel" aria-labelledby={id + '-tab-materials'} hidden={panel !== 'materials'} tabIndex={0}>
      <p className="cl-panel-empty">这门自编课程还没有绑定个人文件。</p>
      <Link className="cl-panel-library" href="/studio?view=materials">打开我的资料 →</Link>
      <h2 className="cl-panel-subtitle">延伸阅读</h2><p className="cl-panel-note">开放参考入口，未作为逐节原文引用。</p>
      {catalog?.course.references.map(reference => <a className="cl-panel-reference" key={reference.url}
        href={reference.url} target="_blank" rel="noreferrer">{reference.title}<span aria-hidden="true">↗</span></a>)}
    </div>
    <div id={id + '-panel-practices'} role="tabpanel" aria-labelledby={id + '-tab-practices'} hidden={panel !== 'practices'} tabIndex={0}>
      <div className="cl-panel-activities">{units.map((unit, index) => <React.Fragment key={unit.id}>
        {unit.lectures.flatMap(lecture => lecture.lessons.map(lesson => practice(lesson, index)))}
        <Link className="cl-panel-activity" href={projectHref(index)}>
          <img src="/reference/hyperknow/components/courseTypeIcon/clipboard-text.svg" alt=""/>
          <span><b>{unit.project.title}</b><small>单元 {index + 1} · Project</small></span>
        </Link>
        {practice({ id: 'unit-exam:' + unit.id, title: unit.title + '综合核查' }, index, 'Unit Check')}
      </React.Fragment>)}</div>
    </div>
  </div>;
}
