import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AssistantCourseDescriptor, AssistantCourseKind, AssistantCourseSummary } from '@study-agent/contracts';
import { z } from 'zod';
import type { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import type { StudentsService } from '../students/students.service';
import { assertSourceCourseAccess } from '../learning/source-course.service';
import { assistantDigest } from './assistant-turn-record';
import { describeTeachingContent, materialLessonTeachingCatalog, primaryUnitTeachingCatalog,
  projectTeachingContent, readTeachingContent, teachingContentReference, teachingContentSnapshotSchema,
  type TeachingCatalog, type TeachingContentSelection, type TeachingContentSnapshot } from './assistant-teaching-content';

const id = z.string().min(1).max(180), kindSchema = z.enum(['primary_unit', 'material_lesson']);
const subjectSchema = z.enum(['math', 'chinese', 'english']).nullable();
const snapshotSchema = z.object({ protocol: z.literal('assistant-course-v1'), kind: kindSchema,
  studentId: id.nullable(), subject: subjectSchema, accessMode: z.enum(['published', 'authoring']),
  teaching: teachingContentSnapshotSchema, fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type AssistantCourseSnapshot = z.infer<typeof snapshotSchema>;
export type CourseTeachingSource = { catalog: TeachingCatalog | null; kind: AssistantCourseKind; studentId: string | null;
  subject: AssistantCourseSnapshot['subject']; accessMode: AssistantCourseSnapshot['accessMode']; current: boolean };

export function courseAssessmentBlock(store: InMemoryStoreService, studentId: string | null, userRole: 'student' | 'parent') {
  if (userRole !== 'student' || !studentId) return undefined;
  const active = store.select('diagnosticSessions', { studentId, status: ['in_progress', 'paused'] }).at(-1);
  return active ? { code: 'assessment_in_progress' as const, message: '请先保留问题并完成当前评测，再继续课程助教。当前题目仍可使用原题提示。',
    href: '/student/assessment?' + new URLSearchParams({ session: active.id }) } : undefined;
}
export function assertCourseAssessmentAvailable(store: InMemoryStoreService, studentId: string | null, userRole: 'student' | 'parent') {
  const block = courseAssessmentBlock(store, studentId, userRole); if (block) throw new ConflictException(block);
}

export function resolveCourseTeachingSource(store: InMemoryStoreService, students: StudentsService, user: InMemoryUserAccount,
  kind: AssistantCourseKind, courseId: string, itemId: string, allowReadOnly = false): CourseTeachingSource {
  const fail = (): null => { if (!allowReadOnly) throw new ConflictException('这份课程尚未确认、已经归档或撤回，请核对当前教学版本'); return null; };
  if (kind === 'primary_unit') {
    const course = store.find('studioCourses', { id: courseId });
    if (!course) throw new NotFoundException('知识课程不存在');
    students.assertCanAccessStudent(user, course.studentId);
    if (!store.find('students', { id: course.studentId })) throw new NotFoundException('原学习档案已不可用');
    const current = course.status === 'active' || course.status === 'completed';
    let catalog: TeachingCatalog | null = current ? null : fail();
    if (current) try { catalog = primaryUnitTeachingCatalog(course, itemId); }
    catch (error) { if (!allowReadOnly || !(error instanceof ConflictException || error instanceof NotFoundException)) throw error; }
    return { kind, studentId: course.studentId, subject: course.subject, accessMode: 'published', current: current && catalog !== null, catalog };
  }
  if (kind !== 'material_lesson') throw new BadRequestException('课程上下文类型不支持');
  const course = store.find('sourceCourses', { id: courseId });
  if (!course) throw new NotFoundException('资料课程不存在');
  assertSourceCourseAccess(user, course, students);
  if (course.studentId && !store.find('students', { id: course.studentId })) throw new NotFoundException('原学习档案已不可用');
  const authoring = course.status === 'ready' && !course.confirmedAt && (!course.versioning || course.versioning.state === 'draft');
  const published = course.status === 'active' && Boolean(course.confirmedAt) && (!course.versioning || course.versioning.state === 'published');
  if (authoring && (user.role === 'student' || user.id !== course.ownerUserId)) throw new ForbiddenException('待核对教案只能由当前作者打开');
  const current = authoring || published;
  let catalog: TeachingCatalog | null = current ? null : fail();
  if (current) try { catalog = materialLessonTeachingCatalog(course, itemId); }
  catch (error) { if (!allowReadOnly || !(error instanceof ConflictException || error instanceof NotFoundException)) throw error; }
  return { kind, studentId: course.studentId, subject: course.subject, accessMode: authoring ? 'authoring' : 'published', current: current && catalog !== null, catalog };
}

function modelContext(kind: AssistantCourseKind, accessMode: AssistantCourseSnapshot['accessMode'], teaching: TeachingContentSnapshot) {
  return { independentStudy: undefined, lecture: undefined, course: { kind, accessMode, teaching }, scope: null, report: null, plan: null,
    memory: null, definitionNotice: null, currentQuestion: null, evidenceIds: [] as string[], withheldAnswer: undefined, bound: null };
}
export function courseAssistantContext(snapshot: AssistantCourseSnapshot) { return modelContext(snapshot.kind, snapshot.accessMode, snapshot.teaching); }
function safeCharacters(context: ReturnType<typeof modelContext>) {
  const { withheldAnswer: _answer, bound: _bound, ...safe } = context; return JSON.stringify(safe).length;
}
export function previewAssistantCourse(source: CourseTeachingSource, selection: TeachingContentSelection = { mode: 'complete' }): AssistantCourseSnapshot {
  if (!source.current || !source.catalog) throw new ConflictException('原课程已不可继续提问，请核对当前版本');
  const teaching = projectTeachingContent(source.catalog, selection);
  const safe = { protocol: 'assistant-course-v1' as const, kind: source.kind, studentId: source.studentId, subject: source.subject, accessMode: source.accessMode, teaching };
  const snapshot = snapshotSchema.parse({ ...safe, fingerprint: assistantDigest(safe) });
  return readAssistantCourse(snapshot, assistantCourseReference(snapshot), teaching.itemId);
}
export function freezeAssistantCourse(source: CourseTeachingSource, selection: TeachingContentSelection = { mode: 'complete' }): AssistantCourseSnapshot {
  const snapshot = previewAssistantCourse(source, selection), size = safeCharacters(courseAssistantContext(snapshot));
  if (size > 18_000) throw new ConflictException({ code: 'teaching_context_over_budget', message: '所选课程上下文过长，请保留问题并选择较少的教学条目',
    maximumCharacters: 18_000, selectedCharacters: size });
  return snapshot;
}
export const assistantCourseReference = (snapshot: AssistantCourseSnapshot) => snapshot.teaching.courseId + '@' + snapshot.fingerprint;

export function readAssistantCourse(value: unknown, referenceId: string, itemId: string): AssistantCourseSnapshot {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success) throw new ConflictException('原课程快照缺失或损坏，请保留对话并返回课程');
  const snapshot = parsed.data, { fingerprint, ...safe } = snapshot;
  if (assistantDigest(safe) !== fingerprint || assistantCourseReference(snapshot) !== referenceId || snapshot.teaching.itemId !== itemId ||
    snapshot.kind === 'primary_unit' && (snapshot.teaching.protocol !== 'primary-unit-v1' || !snapshot.studentId) ||
    snapshot.kind === 'material_lesson' && snapshot.teaching.protocol !== 'material-lesson-v1' ||
    (snapshot.teaching.subject ?? null) !== snapshot.subject || Boolean(snapshot.studentId) !== Boolean(snapshot.subject))
    throw new ConflictException('原课程身份与教学快照不一致，请保留原对话');
  readTeachingContent(snapshot.teaching, teachingContentReference(snapshot.teaching), itemId, null, false);
  return snapshot;
}

export function assistantCourseSummary(snapshot: AssistantCourseSnapshot, current: boolean): AssistantCourseSummary {
  const t = snapshot.teaching, params = new URLSearchParams({ course: t.courseId });
  if (snapshot.studentId) params.set(snapshot.kind === 'primary_unit' ? 'student' : 'studentId', snapshot.studentId);
  if (snapshot.subject) params.set('subject', snapshot.subject);
  if (snapshot.kind === 'primary_unit') { params.set('view', 'courses'); params.set('unit', t.itemId); }
  else params.set('lesson', t.itemId);
  return { kind: snapshot.kind, courseId: t.courseId, courseTitle: t.courseTitle, itemId: t.itemId, itemTitle: t.itemTitle,
    studentId: snapshot.studentId, subject: snapshot.subject, accessMode: snapshot.accessMode, fingerprint: snapshot.fingerprint,
    referenceId: assistantCourseReference(snapshot), current, href: (snapshot.kind === 'primary_unit' ? '/studio?' : '/studio/source-courses?') + params,
    selection: t.selection, coverage: t.coverage };
}
export function assistantCourseDescriptor(snapshot: AssistantCourseSnapshot, source: CourseTeachingSource | null, current: boolean): AssistantCourseDescriptor {
  const t = snapshot.teaching, summary = assistantCourseSummary(snapshot, current);
  if (!current || !source?.catalog) return { ...summary, targets: t.targets, parts: t.parts.map(({ key, title, targetId }) => ({ key, title, targetId })) };
  const info = describeTeachingContent(source.catalog), overview = projectTeachingContent(source.catalog, { mode: 'overview' });
  const overhead = safeCharacters(modelContext(source.kind, source.accessMode, overview)) - JSON.stringify(overview).length;
  const selectedCharacters = safeCharacters(courseAssistantContext(snapshot));
  return { ...summary, targets: info.targets, parts: info.parts.map(p => ({ ...p, selectedCharacters: p.selectedCharacters + overhead })),
    maximumCharacters: 18_000, completeCharacters: info.completeCharacters + overhead, overviewCharacters: info.overviewCharacters + overhead,
    completeFits: info.completeCharacters + overhead <= 18_000, overviewFits: info.overviewCharacters + overhead <= 18_000,
    selectedCharacters, selectionFits: selectedCharacters <= 18_000 };
}
