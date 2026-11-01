import type { LearningScope, StudioCourse } from '@study-agent/contracts';
import { teachingFixture } from './textbook-teaching-fixture';
import { prepareTextbookTeachingPackage, teachingHash } from './textbook-teaching-package';
import { teachingPublicBase } from './textbook-teaching-public';
import { buildStudioCourse } from '../learning/studio-course';
import { prepareTeachingChange } from './textbook-teaching-record';
import { assertTeachingAdoption, assertTeachingAdoptionRecords, assertAdoptedTeachingLesson, currentTeachingAdoptionMaterials,
  freezeTeachingAdoption, teachingAdoptionAuthorization } from './textbook-teaching-adoption';

export function teachingAdoptionFixture(at = new Date().toISOString()) {
  const f = teachingFixture(2), studentId = 'qa-adoption-child', courseId = 'qa-adoption-course', lessonId = 'qa-adoption-lesson',
    mapping = { id: 'qa-adoption-mapping', version: 1, lessonId: f.source.lessonId, atomIds: f.atoms.map(atom => atom.id) };
  const scope: LearningScope = { id: 'qa-adoption-scope', studentId, subject: 'math', grade: 3, term: 'upper', textbookVolumeId: f.source.bookId,
    textbookVersion: f.source.bookVersion, textbookRevision: f.source.bookVersion, learnedAtomIds: mapping.atomIds, currentAtomId: mapping.atomIds[0], minutesPerSession: 15,
    progressMode: 'textbook', selectedLessonIds: [f.source.lessonId], selectedLessonSnapshots: [{ id: f.source.lessonId, name: f.source.lessonName, chapterName: '合成单元' }], mappingSnapshots: [mapping], version: 1, confirmedAt: at };
  const prepared = prepareTextbookTeachingPackage(f.store, f.input, f.source), publicBase = teachingPublicBase(f.input.packageId, 1, prepared),
    authorization = teachingAdoptionAuthorization({ id: 'qa-adopter-parent', role: 'parent', status: 'active', version: 1, principal: 'qa-adopter-only', passwordHash: 'not-a-real-credential', displayName: '合成采用者' },
      { id: 'qa-adopter-session', userId: 'qa-adopter-parent', tokenHash: 'not-a-real-token', createdAt: at, expiresAt: '2026-11-02T07:00:00.000Z', revokedAt: null }),
    adopted = freezeTeachingAdoption({ prepared, publicBase, studentId, courseId, lessonId, scopeVersion: scope.version, mapping, authorization, at,
      verificationHref: '/student/assessment?' + new URLSearchParams({ subject: 'math', student: studentId, course: courseId, teachingLesson: lessonId }) });
  const course: StudioCourse = buildStudioCourse({ id: courseId, studentId, subject: 'math', scope, atoms: f.atoms, focusAtomIds: mapping.atomIds, now: at });
  course.units = [{ id: 'qa-adopted-unit', title: '合成单元', objective: '完整双目标教学', lessons: [
    { id: lessonId, atomId: mapping.atomIds[0], targetAtomIds: [...mapping.atomIds], title: publicBase.content.title, objective: publicBase.content.goals.map(goal => goal.objective).join('；'),
      kind: 'learn', state: 'not_started', href: '/studio?view=courses&course=' + courseId, textbookTeaching: adopted.snapshot },
    { id: 'qa-adopted-practice', atomId: mapping.atomIds[0], targetAtomIds: [...mapping.atomIds], title: '双目标独立检查', objective: '独立核对全部目标', kind: 'practice', state: 'not_started',
      href: adopted.snapshot.lesson.verificationHref!, textbookTeachingLessonId: lessonId },
  ] }];
  const state = { students: [{ id: studentId }], studioCourses: [course], textbookTeachingAdoptions: [adopted.record], privacyRequests: [] as any[] };
  return { ...f, prepared, publicBase, scope, authorization, ...adopted, course, state };
}

/** Original synthetic curriculum and native author/adopter histories. No real
 * textbook, learner answer, assistance or elapsed-learning record is created. */
export function teachingAdoptionNativeFixture() {
  const f = teachingAdoptionFixture(), at = f.record.createdAt, now = Date.parse(at), authorId = 'qa-original-author', authorSessionId = 'qa-original-author-session',
    authorization = { role: 'teacher' as const, accountVersion: 1, sessionId: authorSessionId },
    saved = prepareTeachingChange({ actorId: authorId, authorization, input: f.input, previous: null, prepared: f.prepared, at: new Date(now - 60000).toISOString() }),
    published = prepareTeachingChange({ actorId: authorId, authorization, previous: saved.header, saved: saved.saved, current: f.prepared, at: new Date(now - 30000).toISOString(),
      input: { action: 'publish', packageId: f.input.packageId, requestKey: 'qa-adoption-original-publish', expectedRevision: 1, contentVersion: 1,
        contentFingerprint: f.prepared.report.contentFingerprint, preflightFingerprint: f.prepared.report.fingerprint, reviewed: true, originalTeaching: true,
        reason: '明确核对合成工程教学稿的原内容和材料；本夹具不代表真实教师审核结论。' } });
  const users = [
    { id: authorId, role: 'teacher', version: 1, status: 'active', principal: 'qa-original-author-only', passwordHash: 'synthetic-not-a-credential', displayName: '合成原作者' },
    { id: 'qa-adopter-parent', role: 'parent', version: 1, status: 'active', principal: 'qa-adopter-only', passwordHash: 'synthetic-not-a-credential', displayName: '合成采用者' },
  ], sessions = users.map(user => ({ id: user.id === authorId ? authorSessionId : 'qa-adopter-session', userId: user.id, tokenHash: teachingHash({ syntheticSession: user.id }),
    createdAt: new Date(now - 120000).toISOString(), expiresAt: new Date(now + 86400000).toISOString(), revokedAt: null }));
  const state: Record<string, any[]> = { ...structuredClone(f.state), users, sessions,
    bindings: [{ id: 'qa-adoption-binding', parentUserId: 'qa-adopter-parent', studentId: f.course.studentId, status: 'active', relation: 'guardian' }],
    learningScopes: [structuredClone(f.scope)], textbookAtomMappings: [{ ...structuredClone(f.record.mapping), bookId: f.source.bookId, bookVersion: f.source.bookVersion,
      status: 'approved', rationale: '合成双目标与原课时完整对齐；仅为工程验证', reviewerId: authorId, reviewedAt: new Date(now - 120000).toISOString() }],
    studioActivities: [{ id: 'qa-adoption-created-activity', kind: 'course_created', referenceId: f.course.id, studentId: f.course.studentId, subject: f.course.subject,
      actorId: 'qa-adopter-parent', requestKey: 'qa-adoption-course-created', requestHash: teachingHash({ original: 'synthetic' }), at }],
    textbookTeachingPackages: [published.header], textbookTeachingVersions: [saved.saved!], textbookTeachingSources: [saved.source!], textbookTeachingCommands: [saved.command, published.command] };
  for (const name of ['knowledgeAtoms', 'questions', 'questionSources', 'questionAnswerSchemas', 'measurementItems'] as const) state[name] = [...structuredClone(f.store.inspect(name))];
  const before = structuredClone(state); before.studioCourses = []; before.textbookTeachingAdoptions = []; before.studioActivities = [];
  const changes = ['studioCourses', 'textbookTeachingAdoptions', 'studioActivities'].flatMap(collection => state[collection].map(row => ({ collection, id: row.id, body: JSON.stringify(row) })));
  return { ...f, native: { before, state, changes, now, saved, published } };
}
