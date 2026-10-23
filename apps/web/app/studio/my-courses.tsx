'use client';
import * as React from 'react';
import Link from 'next/link';
import type { ClassroomCatalog, StudioCourse, StudioSubject } from '@study-agent/contracts';
import { CourseCover } from './classroom/diagram';
import { defaultCourseFilters, filterLibraryCourses, libraryCourses, readCourseFilters, writeCourseFilters, type CourseFilters, type LibraryCourse } from './course-library-state';
import './classroom/classroom.css';
import './course-library.css';

export function MyCourses({ courses, classroom, studentId, subject, programmingHref, onOpen, onCreate }: { courses: StudioCourse[]; classroom: ClassroomCatalog | null;
  studentId: string; subject: StudioSubject; programmingHref: string; onOpen: (course: StudioCourse) => void; onCreate: () => void }) {
  const [filters, setFilters] = React.useState<CourseFilters>(defaultCourseFilters), [weekOffset, setWeekOffset] = React.useState(0);
  React.useEffect(() => { const restore = () => setFilters(readCourseFilters(window.location.search)); restore(); window.addEventListener('popstate', restore); return () => window.removeEventListener('popstate', restore); }, []);
  function update(patch: Partial<CourseFilters>, replace = false) {
    const next = { ...filters, ...patch }; setFilters(next);
    const params = writeCourseFilters(new URLSearchParams(window.location.search), next);
    window.history[replace ? 'replaceState' : 'pushState'](null, '', '/studio?' + params);
  }
  const rows = libraryCourses(courses, classroom), visible = filterLibraryCourses(rows, filters);
  const lessonList = classroom?.course.units.flatMap(unit => unit.lectures.flatMap(lecture => lecture.lessons)) ?? [];
  const reading = classroom?.readingProgress ?? classroom?.progress ?? [];
  const progress = new Map(reading.map(row => [row.lessonId, row]));
  const recent = [...reading].filter(row => lessonList.some(lesson => lesson.id === row.lessonId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const nextLesson = lessonList.find(lesson => lesson.id === recent?.lessonId && !recent.completed) ?? lessonList.find(lesson => !progress.get(lesson.id)?.completed) ?? lessonList[0];
  function link(base: string) {
    const [pathname, query] = base.split('?'), params = writeCourseFilters(new URLSearchParams(query), filters);
    if (pathname === '/studio/classroom') { if (studentId) params.set('returnStudent', studentId); params.set('returnSubject', subject); }
    else { if (studentId) params.set('student', studentId); params.set('subject', subject); }
    return pathname + '?' + params;
  }
  function resume(row: LibraryCourse) {
    const course = row.course;
    if (!course) {
      const saved = progress.get(nextLesson?.id);
      return link('/studio/classroom?' + new URLSearchParams({ ...(nextLesson ? { lesson: nextLesson.id } : {}), ...(saved ? { session: saved.sessionId } : {}) }));
    }
    const next = nextFor(course);
    return next?.teaching?.teaching.reviewStatus === 'approved'
      ? link('/studio/classroom?' + new URLSearchParams({ studioCourseId: course.id, lesson: next.id, returnStudent: course.studentId, returnSubject: course.subject }))
      : link('/studio?' + new URLSearchParams({ view: 'courses', course: course.id }));
  }
  function nextFor(course: StudioCourse) {
    const lessons = course.units.flatMap(unit => unit.lessons).filter(lesson => lesson.kind === 'learn');
    return lessons.find(lesson => lesson.id === course.learningProgress?.lastLessonId && !course.learningProgress?.viewedLessonIds.includes(lesson.id)) ?? lessons.find(lesson => !course.learningProgress?.viewedLessonIds.includes(lesson.id)) ?? lessons[0];
  }
  const reference = new Date(); reference.setHours(0, 0, 0, 0); reference.setDate(reference.getDate() - (reference.getDay() + 6) % 7 + weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, index) => { const day = new Date(reference); day.setDate(day.getDate() + index); return day; });
  const dayCounts = days.map(day => reading.filter(row => row.completed && lessonList.some(lesson => lesson.id === row.lessonId) && new Date(row.updatedAt).toDateString() === day.toDateString()).length);
  const filtered = Object.keys(filters).some(key => filters[key as keyof CourseFilters] !== defaultCourseFilters[key as keyof CourseFilters]);
  return <section className="ws-courses"><div className="ws-course-main"><header className="ws-page-title"><h1>我的课程</h1><button onClick={onCreate}>＋ 创建课程</button></header>
    <div className="ws-course-filters"><div role="tablist" aria-label="课程状态">{(['all', 'new', 'active', 'complete'] as const).map((value, index) => <button key={value} role="tab" aria-selected={filters.state === value} onClick={() => update({ state: value })}>{['全部', '未开始', '进行中', '已完成'][index]}</button>)}</div>
      <label>⌕<input aria-label="搜索课程" maxLength={180} placeholder="搜索名称、目标、教材…" value={filters.query} onChange={event => update({ query: event.target.value }, true)}/></label></div>
    <div className="ws-library-options">
      <label>课程类型<select aria-label="课程类型" value={filters.type} onChange={event => update({ type: event.target.value as CourseFilters['type'] })}><option value="all">全部类型</option><option value="adult">成人独立课</option><option value="primary">小学学习课</option></select></label>
      <label>内容来源<select aria-label="内容来源" value={filters.source} onChange={event => update({ source: event.target.value as CourseFilters['source'] })}><option value="all">全部来源</option><option value="authored">自编主题课程</option><option value="curriculum">已确认范围课程</option></select></label>
      <label>最近学习<select aria-label="最近学习" value={filters.recent} onChange={event => update({ recent: event.target.value as CourseFilters['recent'] })}><option value="all">不限时间</option><option value="7">近7天</option><option value="30">近30天</option></select></label>
      <label>排序<select aria-label="课程排序" value={filters.sort} onChange={event => update({ sort: event.target.value as CourseFilters['sort'] })}><option value="recent">最近学习</option><option value="added">最近添加</option><option value="title">课程名称</option></select></label>
    </div>
    <div className="ws-library-result"><p role="status">显示 {visible.length} / {rows.length} 门课程</p>{filtered && <button onClick={() => update(defaultCourseFilters)}>清除筛选</button>}</div>
    <p className="ws-library-meaning">“已完成”指本课程讲解已读；课堂练习、项目和独立测量分别保留记录。</p>
    <div className="ws-course-library">{visible.map(row => {
      const body = <><div><small>{row.type === 'adult' ? '成人独立课' : `${row.course?.grade}年级 · ${ { math: '数学', chinese: '语文', english: '英语' }[row.course!.subject]}`}</small><h2>{row.title} {row.state === 'new' && <em>新</em>}</h2><div className="ws-ticket-meta"><span><small>来源</small>{row.source === 'authored' ? 'StudyAgent 自编' : '已确认学习范围'}</span><span><small>课程结构</small>{row.course?.units.length ?? classroom?.course.units.length} 单元 · {row.total} 微课</span></div><p className="ws-ticket-state">{row.state === 'complete' ? '讲解已读' : row.state === 'active' ? '进行中' : '未开始'}{row.lastStudied && <time> · {new Date(row.lastStudied).toLocaleDateString('zh-CN')}</time>}</p></div><CourseCover/>
        <div className="ws-ticket-progress" aria-label={`讲解已读 ${row.viewed} / ${row.total}`}><i style={{ width: (row.viewed / Math.max(1, row.total) * 100) + '%' }}/><span>{row.viewed} / {row.total} 讲</span></div></>;
      const nextTitle = row.course ? nextFor(row.course)?.title : nextLesson?.title;
      return <article className="ws-course-ticket" key={row.id} data-course-type={row.type} data-course-state={row.state}>
        {row.course ? <button className="ws-ticket-main" onClick={() => onOpen(row.course!)} aria-label={'打开课程：' + row.title}>{body}</button> : <Link className="ws-ticket-main" href={link('/studio/classroom')} aria-label={'打开课程：' + row.title}>{body}</Link>}
        <Link className="ws-ticket-next" href={row.state === 'complete' ? row.course ? link('/studio?view=courses&course=' + encodeURIComponent(row.id)) : link('/studio/classroom?panel=practices') : resume(row)}><small>{row.state === 'complete' ? '接下来' : row.state === 'active' ? '继续断点' : '接下来'}</small><em>{row.state === 'complete' ? '复盘' : '讲座'}</em><b>{row.state === 'complete' ? '核对练习与单元表现' : nextTitle ?? '查看课程'}</b><span>{row.state === 'complete' ? '查看课程记录 →' : row.state === 'new' ? '开始学习 →' : '继续学习 →'}</span></Link>
      </article>;
    })}
      {visible.length === 0 && <div className="ws-empty"><h2>{filters.query ? '没有匹配的课程' : filters.state === 'complete' ? '还没有完成的课程' : '当前条件下没有课程'}</h2><p>清除筛选，或调整类型、来源和学习时间。</p><button onClick={() => update(defaultCourseFilters)}>查看全部课程</button></div>}
    </div></div>
    <aside className="ws-course-summary"><section><header><span>{weekOffset === 0 ? '本周' : reference.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + ' 起'}</span><div><button aria-label="上一周学习记录" onClick={() => setWeekOffset(value => value - 1)}>‹</button><button aria-label="下一周学习记录" disabled={weekOffset >= 0} onClick={() => setWeekOffset(value => value + 1)}>›</button></div></header>
      <h2>已读 {dayCounts.reduce((sum, value) => sum + value, 0)} 个微课</h2><p>成人独立课已读微课的最近学习日期。</p><div className="ws-week-strip">{days.map((day, index) => <div key={index} data-today={day.toDateString() === new Date().toDateString()}><small>{['一', '二', '三', '四', '五', '六', '日'][index]}</small><b>{dayCounts[index]}</b></div>)}</div>
      {classroom && <Link className="ws-resume-card" href={resume(rows.find(row => row.type === 'adult')!)}><small>继续成人独立课</small><b>{classroom.course.title}</b><span>{nextLesson?.title} →</span></Link>}</section>
      <section><h2>学习工具</h2><p>把资料、安排和复盘接回课程。</p><Link className="ws-tool-link" href={link('/studio?view=materials')}>资料与学案 <span>→</span></Link><Link className="ws-tool-link" href={link('/studio?view=calendar')}>安排学习时间 <span>→</span></Link><Link className="ws-tool-link" href={link('/studio?view=history')}>查看学习历史 <span>→</span></Link>{studentId && <Link className="ws-tool-link" href={programmingHref}><span>GESP C++ · 独立编程轨道<small className="ws-track-note">概念、跟踪、代码实现和保持分别记录</small></span><span>→</span></Link>}</section>
    </aside>
  </section>;
}
