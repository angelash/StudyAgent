import type { ClassroomCatalog, StudioCourse, SourceCourseSummary } from '@study-agent/contracts';

export type CourseFilters = {
  query: string;
  state: 'all' | 'new' | 'active' | 'complete';
  type: 'all' | 'adult' | 'primary';
  source: 'all' | 'authored' | 'curriculum' | 'material';
  recent: 'all' | '7' | '30';
  sort: 'recent' | 'added' | 'title';
};
export const defaultCourseFilters: CourseFilters = { query: '', state: 'all', type: 'all', source: 'all', recent: 'all', sort: 'recent' };
const keys: Record<keyof CourseFilters, string> = {
  query: 'courseQuery', state: 'courseState', type: 'courseType', source: 'courseSource', recent: 'courseRecent', sort: 'courseSort'
};
export function readCourseFilters(search: string): CourseFilters {
  const p = new URLSearchParams(search);
  function value<K extends keyof CourseFilters>(key: K, options: readonly CourseFilters[K][]): CourseFilters[K] {
    const input = p.get(keys[key]) as CourseFilters[K];
    return options.includes(input) ? input : defaultCourseFilters[key];
  }
  return { query: (p.get(keys.query) ?? '').slice(0, 180), state: value('state', ['all', 'new', 'active', 'complete']),
    type: value('type', ['all', 'adult', 'primary']), source: value('source', ['all', 'authored', 'curriculum','material']),
    recent: value('recent', ['all', '7', '30']), sort: value('sort', ['recent', 'added', 'title']) };
}
export function writeCourseFilters(params: URLSearchParams, filters: CourseFilters) {
  for (const key of Object.keys(keys) as Array<keyof CourseFilters>) {
    if (filters[key] === defaultCourseFilters[key]) params.delete(keys[key]);
    else params.set(keys[key], filters[key]);
  }
  return params;
}
export function copyCourseFilters(search: string, params: URLSearchParams) { return writeCourseFilters(params, readCourseFilters(search)); }
export function courseLibraryHref(search: string) {
  const source = new URLSearchParams(search), params = copyCourseFilters(search, new URLSearchParams({ view: 'courses' }));
  const student = source.get('returnStudent') || source.get('student'), subject = source.get('returnSubject') || source.get('subject');
  if (student) params.set('student', student);
  if (subject && ['math', 'chinese', 'english', 'chemistry'].includes(subject)) params.set('subject', subject);
  return '/studio?' + params;
}

export type LibraryCourse = {
  id: string; title: string; type: 'adult' | 'primary'; source: 'authored' | 'curriculum'|'material';
  total: number; viewed: number; state: Exclude<CourseFilters['state'], 'all'>;
  lastStudied: string | null; added: string | null; searchText: string;
  course?: StudioCourse;
  sourceCourse?:SourceCourseSummary;
};
function latest(values: Array<string | null | undefined>) { return values.filter((v): v is string => Boolean(v)).sort().at(-1) ?? null; }
export function libraryCourses(courses: StudioCourse[], classroom: ClassroomCatalog | null,sourceCourses:SourceCourseSummary[]=[]): LibraryCourse[] {
  const rows: LibraryCourse[] = courses.map(course => {
    const lessons = course.units.flatMap(unit => unit.lessons).filter(lesson => lesson.kind === 'learn');
    const viewed = lessons.filter(lesson => course.learningProgress?.viewedLessonIds.includes(lesson.id)).length;
    const lastStudied = course.learningProgress?.updatedAt ?? null;
    return { id: course.id, title: course.title, type: 'primary', source: 'curriculum', total: lessons.length, viewed,
      state: lessons.length > 0 && viewed === lessons.length ? 'complete' : lastStudied ? 'active' : 'new',
      lastStudied, added: course.createdAt, searchText: [course.title, course.objective, course.textbookVersion, course.grade + '年级', course.subject].join(' '), course };
  });
  for(const course of sourceCourses.filter(course=>course.status==='active'))rows.push({id:course.id,title:course.title,type:course.studentId?'primary':'adult',source:'material',
    total:course.lessonCount,viewed:course.viewed,state:course.lessonCount>0&&course.viewed===course.lessonCount?'complete':course.lastStudied?'active':'new',lastStudied:course.lastStudied,
    added:course.createdAt,searchText:[course.title,course.goal,'资料 PDF 生成课程'].join(' '),sourceCourse:course});
  if (classroom) {
    const lessons = classroom.course.units.flatMap(unit => unit.lectures.flatMap(lecture => lecture.lessons));
    const completed = new Set((classroom.readingProgress ?? classroom.progress).filter(row => row.completed).map(row => row.lessonId));
    const viewed = lessons.filter(lesson => completed.has(lesson.id)).length;
    const lastStudied = latest([...classroom.progress.map(row => row.updatedAt), ...(classroom.archivedSessions ?? []).map(row => row.updatedAt)]);
    rows.push({ id: classroom.course.id, title: classroom.course.title, type: 'adult', source: 'authored',
      total: lessons.length, viewed, state: lessons.length > 0 && viewed === lessons.length ? 'complete' : lastStudied ? 'active' : 'new',
      lastStudied, added: null, searchText: [classroom.course.title, classroom.course.description, '成人 社会学 自编'].join(' ') });
  }
  return rows;
}
export function filterLibraryCourses(rows: LibraryCourse[], filters: CourseFilters, now = Date.now()) {
  const query = filters.query.trim().toLocaleLowerCase();
  return rows.filter(row => (!query || row.searchText.toLocaleLowerCase().includes(query)) &&
    (filters.state === 'all' || filters.state === row.state) && (filters.type === 'all' || filters.type === row.type) &&
    (filters.source === 'all' || filters.source === row.source) && (filters.recent === 'all' ||
      Boolean(row.lastStudied && Date.parse(row.lastStudied) >= now - Number(filters.recent) * 86400000)))
    .sort((a, b) => filters.sort === 'title' ? a.title.localeCompare(b.title, 'zh-CN') :
      ((filters.sort === 'added' ? b.added : b.lastStudied) ?? '').localeCompare((filters.sort === 'added' ? a.added : a.lastStudied) ?? '') || a.title.localeCompare(b.title, 'zh-CN'));
}
