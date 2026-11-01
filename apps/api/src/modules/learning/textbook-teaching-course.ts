import type { CurriculumBook, LearningScope, StudioCourse, StudioUnit, TextbookTeachingCourseDraft, TextbookTeachingCourseSelection, TextbookTeachingPublicBase } from '@study-agent/contracts';
import { studioCourseRequestIssue } from '@study-agent/contracts';
import { buildCoursePace } from './studio-course';
import { teachingHash, type PreparedTextbookTeaching } from '../diagnostics/textbook-teaching-package';
import { freezeTeachingAdoption, type TeachingAdoptionAuthorization, type TextbookTeachingAdoptionRecord } from '../diagnostics/textbook-teaching-adoption';
import { teachingPublicFingerprint } from '../diagnostics/textbook-teaching-public';

export type ResolvedTeachingCourse = { scope: LearningScope; book: CurriculumBook; entries: Array<{ chapterId: string; chapterName: string;
  publicBase: TextbookTeachingPublicBase; prepared: PreparedTextbookTeaching; mapping: TextbookTeachingAdoptionRecord['mapping'] }> };
const names = { math: '数学', chinese: '语文', english: '英语', chemistry: '化学' };
export function buildTextbookTeachingCourse(value: ResolvedTeachingCourse, draft: TextbookTeachingCourseDraft, id: string, at: string, authorization: TeachingAdoptionAuthorization, generation?:string) {
  const { scope, book, entries } = value;
  if (!entries.length || entries.length > 1000 || draft.studentId !== scope.studentId || draft.subject !== scope.subject || book.id !== scope.textbookVolumeId || book.version !== scope.textbookRevision ||
      book.subject !== scope.subject || book.grade !== scope.grade || book.term !== scope.term) throw Error('textbook_teaching_course_scope_changed');
  const selected = new Map(entries.map(entry => [entry.publicBase.source.lessonId, entry]));
  const ordered = book.chapters.flatMap(chapter => chapter.lessons.map(lesson => selected.get(lesson.id)).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)));
  if (ordered.length !== entries.length || selected.size !== entries.length) throw Error('textbook_teaching_course_exact_lessons_required');
  const title = draft.title?.trim() || `${scope.grade}年级${names[scope.subject]} · ${ordered.length}课时`, issue = studioCourseRequestIssue(title, draft.subject, scope.grade);
  if (issue) throw Error(issue);
  const focusAtomIds = [...new Set(ordered.flatMap(entry => entry.publicBase.targets.map(target => target.atomId)))];
  if (focusAtomIds.some(id => !scope.learnedAtomIds.includes(id))) throw Error('textbook_teaching_course_unconfirmed_target');
  const selection: TextbookTeachingCourseSelection = { bookId: book.id, bookVersion: book.version,
    lessons: ordered.map(({ publicBase }) => ({ lessonId: publicBase.source.lessonId, packageId: publicBase.packageId, contentVersion: publicBase.contentVersion, fingerprint: teachingPublicFingerprint(publicBase) })) };
  const objective = draft.objective?.trim() || `依据《${book.title}》${book.edition}已确认的${ordered.length}个课时，完成${focusAtomIds.length}个明确目标的教学、独立检查与到期新题核查。`,
    minutesPerSession = draft.minutesPerSession ?? scope.minutesPerSession;
  // This fingerprint is entirely public. In particular it does not include a
  // private report, material answer digest, editor command or adopter identity.
  const fingerprint = teachingHash({ protocol: 'textbook-teaching-course-blueprint-v1', studentId: scope.studentId, subject: scope.subject, grade: scope.grade, term: scope.term,
    scopeVersion: scope.version, title, objective, minutesPerSession, selection, publications: ordered.map(entry => entry.publicBase), mappings: ordered.map(entry => entry.mapping) });
  const units: StudioUnit[] = [], adoptions: TextbookTeachingAdoptionRecord[] = [];
  for (const entry of ordered) {
    const { publicBase, prepared } = entry, identity = teachingHash({ bookId: book.id, bookVersion: book.version, lessonId: publicBase.source.lessonId, ...(generation?{generation}:{}) }),
      lessonId = 'textbook_learn_' + identity, practiceId = 'textbook_practice_' + identity,
      courseHref = '/studio?' + new URLSearchParams({ view: 'courses', course: id, student: scope.studentId, subject: scope.subject }),
      practiceHref = courseHref + '&practiceLesson=' + encodeURIComponent(practiceId),
      { record, snapshot } = freezeTeachingAdoption({ prepared, publicBase, studentId: scope.studentId, courseId: id, lessonId, verificationHref: practiceHref,
        scopeVersion: scope.version, mapping: entry.mapping, authorization, at });
    const targetAtomIds = publicBase.targets.map(target => target.atomId), materials = new Map(prepared.body.materials.map(material => [material.measurementId, material])),
      practiceSeconds = publicBase.content.checks.filter(check => check.purpose !== 'retention').reduce((seconds, check) => seconds + check.materials.map(ref => materials.get(ref.measurementId)!)
        .filter(Boolean).sort((a, b) => a.expectedSeconds - b.expectedSeconds || a.measurementId.localeCompare(b.measurementId))
        .slice(0, check.purpose === 'transfer' ? 2 : 1).reduce((sum, material) => sum + material.expectedSeconds, 0), 0),
      practiceMinutes = Math.max(1, Math.ceil(practiceSeconds / 60));
    let unit = units.find(unit => unit.id === 'textbook_unit_' + teachingHash({ bookId: book.id, bookVersion: book.version, chapterId: entry.chapterId }));
    if (!unit) { unit = { id: 'textbook_unit_' + teachingHash({ bookId: book.id, bookVersion: book.version, chapterId: entry.chapterId }), title: entry.chapterName,
      objective: `按已确认课时逐课教学，并分别核对理解、执行、迁移和保持。`, lessons: [] }; units.push(unit); }
    unit.lessons.push({ id: lessonId, atomId: targetAtomIds[0], targetAtomIds, title: publicBase.content.title,
      objective: publicBase.content.goals.map(goal => goal.objective).join('；'), kind: 'learn', state: 'not_started',
      href: '/studio/classroom?' + new URLSearchParams({ studioCourseId: id, lesson: lessonId, returnStudent: scope.studentId, returnSubject: scope.subject }), textbookTeaching: snapshot },
      { id: practiceId, atomId: targetAtomIds[0], targetAtomIds: [...targetAtomIds], title: publicBase.content.title + ' · 独立检查',
        objective: publicBase.content.goals.map(goal => goal.successCriterion).join('；'), kind: 'practice', state: 'not_started', href: practiceHref,
        textbookTeachingLessonId: lessonId, estimatedMinutes: practiceMinutes });
    adoptions.push(record);
  }
  const course: StudioCourse = { id, studentId: scope.studentId, subject: scope.subject, grade: scope.grade, term: scope.term, title, objective,
    description: `采用《${book.title}》${book.edition}的准确已发布教学版本；范围为已确认的${ordered.length}课时、${focusAtomIds.length}目标。既有课堂不会因新稿自动改变。`,
    status: 'draft', source: 'studyagent_curriculum', scopeVersion: scope.version, textbookVersion: scope.textbookVersion,
    curriculumVersion: teachingHash({ targets: ordered.flatMap(entry => entry.publicBase.targets) }), teachingVersion: 'textbook-teaching-course-v1',
    focusAtomIds, teachingSelection: selection, units, fingerprint, createdAt: at, updatedAt: at, pace: buildCoursePace(units, minutesPerSession),
    materials: [{ id: 'scope', title: '教材与已确认课时', detail: `${book.title} · ${book.edition} · ${ordered.length}课时`, status: 'available' },
      { id: 'teaching', title: '准确教学版本', detail: '完整讲解、例题、图示与检查安排已随课程冻结；独立练习前仍核对原材料和当前权限。', status: 'available' }] };
  return { course, adoptions };
}
