import { createHash } from 'node:crypto';
import type { KnowledgeAtom, LearningScope, StudioCourse } from '@study-agent/contracts';
import { CHEMISTRY_BOOK_ID, CHEMISTRY_VERSION, chemistryUnits, chemistryAtomId } from '../diagnostics/chemistry-curriculum';
import { buildStudioCourse } from './studio-course';

export const CHEMISTRY_COURSE_TITLE = '广州人教版九上化学 · 学习与验证';
export const CHEMISTRY_TEXTBOOK = '广州人教版九上化学 · 原创教学验证路径';
export const chemistryCourseFingerprint = (course: StudioCourse) => {
  const { id: _id, fingerprint: _fingerprint, createdAt: _created, updatedAt: _updated, learningProgress: _progress, ...content } = course;
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
};
export function chemistryCourseHref(studentId: string, courseId: string, unit?: string, panel?: string) {
  return '/studio?' + new URLSearchParams({ view: 'courses', student: studentId, subject: 'chemistry', course: courseId,
    ...(unit ? { unit } : {}), ...(panel ? { panel } : {}) });
}
export function chemistryScope(studentId: string, atomIds: string[], id: string, minutes: number): LearningScope {
  return { id, studentId, subject: 'chemistry', grade: 9, term: 'upper', textbookVolumeId: CHEMISTRY_BOOK_ID,
    textbookVersion: CHEMISTRY_TEXTBOOK, learnedAtomIds: atomIds, currentAtomId: atomIds[0], minutesPerSession: minutes,
    progressMode: 'knowledge', selectedLessonIds: [], version: 1, confirmedAt: new Date().toISOString() };
}
export function isChemistrySemesterCourse(course: StudioCourse) {
  const atomIds = chemistryUnits.flatMap(unit => unit.codes.map(chemistryAtomId));
  return course.subject === 'chemistry' && course.grade === 9 && course.term === 'upper' &&
    (course.curriculumVersion === CHEMISTRY_VERSION || course.textbookVersion === CHEMISTRY_TEXTBOOK) &&
    course.focusAtomIds.length === atomIds.length && atomIds.every(id => course.focusAtomIds.includes(id));
}
export function buildChemistryCourse(studentId: string, atoms: KnowledgeAtom[], options: { id?: string; title?: string; status?: StudioCourse['status']; createdAt?: string } = {}): StudioCourse {
  const atomIds = chemistryUnits.flatMap(unit => unit.codes.map(chemistryAtomId));
  if (atoms.length !== atomIds.length || atoms.some(atom => atom.subject !== 'chemistry' || atom.grade !== 9 || atom.curriculumVersion !== CHEMISTRY_VERSION) || atomIds.some(id => !atoms.some(atom => atom.id === id)))
    throw new Error('化学课程必须使用完整的九上化学知识点');
  const id = options.id ?? `chemistry-course:${studentId}:${CHEMISTRY_VERSION}`;
  const scope = chemistryScope(studentId, atomIds, `chemistry-plan:${studentId}:${CHEMISTRY_VERSION}`, 25);
  const course: StudioCourse = { ...buildStudioCourse({ id, studentId, subject: 'chemistry', scope, atoms, focusAtomIds: atomIds,
    title: options.title ?? CHEMISTRY_COURSE_TITLE, objective: '从概念证据出发，完成课前诊断、讲解、练习、独立考核与真实间隔复测。', minutesPerSession: 25 }),
    status: options.status ?? 'active', curriculumVersion: CHEMISTRY_VERSION,
    description: '广州 · 人教版 · 九年级上学期。七个单元、28节讲解，配套课前诊断、练习、单元与学期考核。' };
  if (options.createdAt) course.createdAt = options.createdAt;
  for (const unit of course.units) for (const lesson of unit.lessons) {
    if (lesson.kind === 'exam') lesson.href = chemistryCourseHref(studentId, id, unit.id, 'checks');
    else {
      const destination = new URL(lesson.href, 'http://study-agent.local');
      destination.searchParams.set('studentId', studentId);
      lesson.href = destination.pathname + destination.search;
    }
  }
  course.fingerprint = chemistryCourseFingerprint(course);
  return course;
}
