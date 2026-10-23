'use client';
import * as React from 'react';
import Link from 'next/link';
import type { ClassroomCatalog, StudioCourse } from '@study-agent/contracts';
import { CourseCover } from './classroom/diagram';
import './classroom/classroom.css';

export function MyCourses({ courses, classroom, onOpen, onCreate }: { courses: StudioCourse[]; classroom: ClassroomCatalog | null;
  onOpen: (course: StudioCourse) => void; onCreate: () => void }) {
  const [filter, setFilter] = React.useState<'all' | 'active' | 'complete'>('all'), [query, setQuery] = React.useState('');
  const [weekOffset, setWeekOffset] = React.useState(0);
  const lessons = classroom?.course.units.flatMap(unit => unit.lectures.flatMap(lecture => lecture.lessons)) ?? [];
  const progress = new Map(classroom?.progress.map(row => [row.lessonId, row]) ?? []);
  const viewed = lessons.filter(lesson => progress.get(lesson.id)?.completed).length;
  const recent = classroom?.progress.filter(row => lessons.some(lesson => lesson.id === row.lessonId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const nextLesson = lessons.find(lesson => lesson.id === recent?.lessonId && !recent.completed) ?? lessons.find(lesson => !progress.get(lesson.id)?.completed) ?? lessons[0];
  const reference = new Date(); reference.setHours(0, 0, 0, 0); reference.setDate(reference.getDate() - (reference.getDay() + 6) % 7 + weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, index) => { const day = new Date(reference); day.setDate(day.getDate() + index); return day; });
  const dayCounts = days.map(day => (classroom?.progress ?? []).filter(row => row.completed && lessons.some(lesson => lesson.id === row.lessonId) && new Date(row.updatedAt).toDateString() === day.toDateString()).length);
  function matches(title: string, completed: boolean) { return title.toLowerCase().includes(query.trim().toLowerCase()) && (filter === 'all' || (filter === 'complete') === completed); }
  const courseCompleted = (course: StudioCourse) => { const lessons = course.units.flatMap(unit => unit.lessons).filter(lesson => lesson.kind === 'learn'); return lessons.length > 0 && lessons.every(lesson => course.learningProgress?.viewedLessonIds.includes(lesson.id)); };
  const visibleCourses = courses.filter(course => matches(course.title, courseCompleted(course)));
  const adultVisible = classroom && matches(classroom.course.title, viewed === lessons.length && lessons.length > 0);
  return <section className="ws-courses"><div className="ws-course-main"><header className="ws-page-title"><h1>我的课程</h1><button onClick={onCreate}>＋ 创建课程</button></header>
    <div className="ws-course-filters"><div role="tablist" aria-label="课程状态">{(['all', 'active', 'complete'] as const).map((value, index) => <button key={value} role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}>{['全部', '进行中', '已完成'][index]}</button>)}</div>
      <label>⌕<input aria-label="搜索课程" placeholder="搜索课程…" value={query} onChange={event => setQuery(event.target.value)}/></label></div>
    <div className="ws-course-library">{adultVisible && <article className="ws-course-ticket"><Link href="/studio/classroom" className="ws-ticket-main" aria-label="打开课程：社会学概论">
      <div><small>课程名称</small><h2>{classroom.course.title} {!recent && <em>新</em>}</h2><div className="ws-ticket-meta"><span><small>来源</small>StudyAgent 自编</span><span><small>课程结构</small>5 单元 · 60 微课</span></div></div><CourseCover/>
      <div className="ws-ticket-progress"><i style={{ width: (viewed / lessons.length * 100) + '%' }}/><span>{Math.round(viewed / lessons.length * 100)}%</span></div></Link>
      <Link className="ws-ticket-next" href={'/studio/classroom?lesson=' + nextLesson?.id}><small>接下来</small><em>讲座</em><b>{nextLesson?.title}</b><span>{recent ? '继续学习 →' : '开始学习 →'}</span></Link></article>}
      {visibleCourses.map(course => { const total = course.units.flatMap(unit => unit.lessons).filter(lesson => lesson.kind === 'learn').length;
        const complete = course.learningProgress?.viewedLessonIds.length ?? 0;
        const learning = course.units.flatMap(unit => unit.lessons).filter(lesson => lesson.kind === 'learn');
        const next = learning.find(lesson => lesson.id === course.learningProgress?.lastLessonId && !course.learningProgress?.viewedLessonIds.includes(lesson.id)) ?? learning.find(lesson => !course.learningProgress?.viewedLessonIds.includes(lesson.id)) ?? learning[0];
        const nextHref = next?.teaching?.teaching.reviewStatus === 'approved' ? '/studio/classroom?' + new URLSearchParams({studioCourseId:course.id,lesson:next.id,returnStudent:course.studentId,returnSubject:course.subject}) : next?.href ?? '/studio?course=' + course.id;
        return <article className="ws-course-ticket" key={course.id}><button className="ws-ticket-main" onClick={() => onOpen(course)} aria-label={'打开课程：' + course.title}><div><small>课程名称</small><h2>{course.title}</h2><div className="ws-ticket-meta"><span><small>学习范围</small>{course.grade} 年级</span><span><small>添加日期</small>{new Date(course.createdAt).toLocaleDateString('zh-CN')}</span></div></div><CourseCover/><div className="ws-ticket-progress"><i style={{ width: Math.min(100, complete / Math.max(1, total) * 100) + '%' }}/><span>{complete} / {total} 讲</span></div></button>
          <Link className="ws-ticket-next" href={nextHref}><small>接下来</small><em>讲座</em><b>{next?.title ?? '查看课程'}</b><span>继续学习 →</span></Link></article>; })}
      {!adultVisible && visibleCourses.length === 0 && <div className="ws-empty"><h2>{query ? '没有匹配的课程' : filter === 'complete' ? '还没有完成的课程' : '这里还没有课程'}</h2><p>{query ? '试试其他关键词，或清空搜索。' : '选择其他状态，或创建一门新课程。'}</p><button onClick={() => { setQuery(''); setFilter('all'); }}>查看全部课程</button></div>}
    </div></div>
    <aside className="ws-course-summary"><section><header><span>{weekOffset === 0 ? '本周' : reference.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + ' 起'}</span><div><button aria-label="上一周学习记录" onClick={() => setWeekOffset(value => value - 1)}>‹</button><button aria-label="下一周学习记录" disabled={weekOffset >= 0} onClick={() => setWeekOffset(value => value + 1)}>›</button></div></header>
      <h2>已读 {dayCounts.reduce((sum, value) => sum + value, 0)} 个微课</h2><p>按已读微课最近学习日期统计。</p><div className="ws-week-strip">{days.map((day, index) => <div key={index} data-today={day.toDateString() === new Date().toDateString()}><small>{['一', '二', '三', '四', '五', '六', '日'][index]}</small><b>{dayCounts[index]}</b></div>)}</div>
      {classroom && <Link className="ws-resume-card" href={'/studio/classroom?lesson=' + nextLesson?.id}><small>从上次学习的地方继续</small><b>{classroom.course.title}</b><span>{nextLesson?.title} →</span></Link>}</section>
      <section><h2>学习工具</h2><p>把资料、安排和复盘接回课程。</p><Link className="ws-tool-link" href="/studio?view=materials">资料与学案 <span>→</span></Link><Link className="ws-tool-link" href="/studio?view=calendar">安排学习时间 <span>→</span></Link><Link className="ws-tool-link" href="/studio?view=history">查看学习历史 <span>→</span></Link></section>
    </aside>
  </section>;
}
