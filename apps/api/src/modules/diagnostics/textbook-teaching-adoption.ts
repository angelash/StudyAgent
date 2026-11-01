import { z } from 'zod';
import { textbookTeachingMaterialSnapshotSchema, textbookTeachingTargetSnapshotSchema, textbookTeachingPublicBaseSchema,
  type TextbookTeachingPublicBase, type TextbookTeachingPublicSnapshot, type StudioCourse, type StudioLesson } from '@study-agent/contracts';
import type { InMemoryStoreService, InMemoryAuthSession, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { compileSelector } from '../../infrastructure/domain-selection';
import { teachingHash, teachingTargetSnapshot, type PreparedTextbookTeaching } from './textbook-teaching-package';
import { teachingPublicBase, teachingPublicFingerprint, teachingClassroomSnapshot } from './textbook-teaching-public';
import { eligibleMeasurements } from './eligible-measurements';
import { questionContentFingerprint } from './measurement-definition';
import { canonicalFamily, FAMILY_IDENTITY_VERSION } from './family-identity';
import { DIAGNOSIS_VERSION } from './diagnosis';
import { MATERIAL_COVERAGE_VERSION } from './verification-materials';
import { retainedCourseSnapshots } from '../learning/studio-course-history-lookup';

const key = z.string().min(1).max(180).refine(value => value === value.trim() && !/[\x00-\x1f]/.test(value)), fingerprint = z.string().regex(/^[a-f0-9]{64}$/), positive = z.number().int().min(1);
export const textbookTeachingAdoptionCollection = 'textbookTeachingAdoptions' as const;
/** Adopter authorization is an opaque historical proof. It contains no author
 * identity, session ID/token, original quotation or author command. */
export const teachingAdoptionAuthorizationSchema = z.object({ actorHash: fingerprint, role: z.enum(['parent', 'admin', 'teacher', 'operator', 'student']), accountVersion: positive,
  sessionHash: fingerprint, learningAccess: z.object({ guardianHash: fingerprint, version: positive }).strict().nullable() }).strict();
export type TeachingAdoptionAuthorization = z.infer<typeof teachingAdoptionAuthorizationSchema>;
export const textbookTeachingAdoptionSchema = z.object({ protocol: z.literal('textbook-teaching-adoption-v1'), id: key, studentId: key, courseId: key, lessonId: key,
  scopeVersion: positive, createdAt: z.string().datetime(), publicVersion: z.object({ packageId: key, contentVersion: positive.max(1000), fingerprint }).strict(),
  mapping: z.object({ id: key, version: positive, lessonId: key, atomIds: z.array(key).min(1).max(1000) }).strict(),
  authorization: teachingAdoptionAuthorizationSchema,
  qualification: z.object({ targets: z.array(textbookTeachingTargetSnapshotSchema.extend({ status: z.literal('published') }).strict()).min(1).max(8),
    materials: z.array(textbookTeachingMaterialSnapshotSchema).max(1280), rules: z.object({ diagnosis: key, familyIdentity: key, materialCoverage: key }).strict() }).strict(), fingerprint,
}).strict();
export type TextbookTeachingAdoptionRecord = z.infer<typeof textbookTeachingAdoptionSchema>;
type State = Record<string, any[]>;
const same = (a: unknown, b: unknown) => teachingHash(a) === teachingHash(b);
function fail(): never { throw Error('textbook_teaching_adoption_integrity_failed'); }
export const teachingAdoptionId = (studentId: string, courseId: string, lessonId: string) => 'textbook_teaching_adoption_' + teachingHash({ studentId, courseId, lessonId });
export function teachingAdoptionAuthorization(actor: InMemoryUserAccount, session: InMemoryAuthSession): TeachingAdoptionAuthorization {
  return teachingAdoptionAuthorizationSchema.parse({ actorHash: teachingHash({ id: actor.id }), role: actor.role, accountVersion: actor.version ?? 1,
    sessionHash: teachingHash({ id: session.id }), learningAccess: actor.role === 'student' ? { guardianHash: teachingHash({ id: session.guardianId }), version: session.accessVersion } : null });
}
export function assertTeachingAdoption(value: unknown): TextbookTeachingAdoptionRecord {
  const record = textbookTeachingAdoptionSchema.parse(value), { fingerprint: digest, ...body } = record;
  if (!same(record, value) || digest !== teachingHash(body) || record.id !== teachingAdoptionId(record.studentId, record.courseId, record.lessonId) ||
      (record.authorization.role === 'student') !== Boolean(record.authorization.learningAccess) ||
      new Set(record.mapping.atomIds).size !== record.mapping.atomIds.length || new Set(record.qualification.targets.map(target => target.atomId)).size !== record.qualification.targets.length ||
      new Set(record.qualification.materials.map(material => material.measurementId)).size !== record.qualification.materials.length) fail();
  return record;
}
export function freezeTeachingAdoption(value: { prepared: PreparedTextbookTeaching; publicBase: TextbookTeachingPublicBase; studentId: string; courseId: string; lessonId: string;
  verificationHref: string; scopeVersion: number; mapping: TextbookTeachingAdoptionRecord['mapping']; authorization: TeachingAdoptionAuthorization; at: string }) {
  const { prepared, publicBase } = value;
  if (!prepared.report.publishable || !same(publicBase, teachingPublicBase(publicBase.packageId, publicBase.contentVersion, prepared)) ||
      value.mapping.lessonId !== publicBase.source.lessonId || publicBase.targets.some(target => !value.mapping.atomIds.includes(target.atomId))) fail();
  const snapshot = teachingClassroomSnapshot(publicBase, { studentId: value.studentId, courseId: value.courseId, lessonId: value.lessonId, verificationHref: value.verificationHref });
  const body = { protocol: 'textbook-teaching-adoption-v1' as const, id: teachingAdoptionId(value.studentId, value.courseId, value.lessonId), studentId: value.studentId,
    courseId: value.courseId, lessonId: value.lessonId, scopeVersion: value.scopeVersion, createdAt: value.at,
    publicVersion: { packageId: publicBase.packageId, contentVersion: publicBase.contentVersion, fingerprint: snapshot.fingerprint },
    mapping: structuredClone(value.mapping), authorization: teachingAdoptionAuthorizationSchema.parse(value.authorization),
    qualification: { targets: prepared.body.targets.map(target => ({ ...structuredClone(target), status: 'published' as const })), materials: structuredClone(prepared.body.materials), rules: structuredClone(prepared.report.rules) } };
  return { record: assertTeachingAdoption({ ...body, fingerprint: teachingHash(body) }), snapshot };
}
function publicBaseOf(value: TextbookTeachingPublicSnapshot) {
  const { fingerprint: _fingerprint, lesson: _lesson, ...body } = value; return textbookTeachingPublicBaseSchema.parse(body);
}
export function assertAdoptedTeachingLesson(recordValue: unknown, course: StudioCourse, lesson: StudioLesson) {
  const record = assertTeachingAdoption(recordValue), snapshot = lesson.textbookTeaching;
  if (!snapshot || record.studentId !== course.studentId || record.courseId !== course.id || record.lessonId !== lesson.id || record.scopeVersion !== course.scopeVersion ||
      lesson.kind !== 'learn' || snapshot.lesson.lectureId !== course.id || snapshot.lesson.id !== lesson.id) fail();
  const base = publicBaseOf(snapshot), expected = teachingClassroomSnapshot(base, { studentId: course.studentId, courseId: course.id, lessonId: lesson.id, verificationHref: snapshot.lesson.verificationHref! }),
    targets = base.targets.map(target => target.atomId);
  if (!same(snapshot, expected) || !same(record.publicVersion, { packageId: base.packageId, contentVersion: base.contentVersion, fingerprint: teachingPublicFingerprint(base) }) ||
      !same(record.qualification.targets, base.targets) || !same(lesson.targetAtomIds, targets) || lesson.atomId !== targets[0] ||
      targets.some(id => !course.focusAtomIds.includes(id) || !record.mapping.atomIds.includes(id)) || record.mapping.lessonId !== base.source.lessonId ||
      lesson.title !== base.content.title || lesson.objective !== base.content.goals.map(goal => goal.objective).join('；')) fail();
  const selected = new Map(base.content.checks.flatMap(check => check.materials.map(material => [material.measurementId, { ...material, atomId: check.atomId }] as const)));
  const byId = new Map(record.qualification.materials.map(material => [material.measurementId, material]));
  if (record.qualification.materials.length !== selected.size || record.qualification.materials.some(material => {
    const ref = selected.get(material.measurementId), target = record.qualification.targets.find(target => target.atomId === material.atomId);
    return !ref || !target || material.definitionFingerprint !== target.definitionFingerprint || ref.atomId !== material.atomId || ref.version !== material.version || ref.questionId !== material.questionId || ref.questionVersion !== material.questionVersion;
  }) || base.content.checks.some(check => check.materials.some(ref => byId.get(ref.measurementId)?.atomId !== check.atomId)) ||
      !same([...new Set(base.content.goals.map(goal => goal.atomId))].sort(), [...targets].sort())) fail();
  return { record, snapshot: structuredClone(expected) };
}
/** Historical validation never needs the author's account or private manuscript.
 * Current question eligibility is checked separately for each new practice. */
export function assertTeachingAdoptionRecords(state: State) {
  const records = (state.textbookTeachingAdoptions ?? []).map(assertTeachingAdoption), courses = retainedCourseSnapshots(state), students = state.students ?? [], receipts = state.privacyRequests ?? [];
  if (new Set(records.map(record => record.id)).size !== records.length) fail();
  const seen = new Set<string>();
  for (const record of records) {
    const course = courses.find(course => course.id === record.courseId && course.studentId === record.studentId && course.units.flatMap((unit:any)=>unit.lessons).some((lesson:any)=>lesson.id===record.lessonId)), lesson = course?.units.flatMap((unit: any) => unit.lessons).find((lesson: any) => lesson.id === record.lessonId);
    if (!students.some(student => student.id === record.studentId) || !course || !lesson || receipts.some(receipt => receipt.erasedStudentHashes?.includes(teachingHash({ id: record.studentId })))) fail();
    assertAdoptedTeachingLesson(record, course, lesson); seen.add(record.id);
  }
  for (const course of courses) for (const lesson of course.units ?? []) for (const item of lesson.lessons ?? []) {
    if (item.textbookTeaching && !seen.has(teachingAdoptionId(course.studentId, course.id, item.id))) fail();
    if (item.textbookTeachingLessonId) {
      const teaching = course.units.flatMap((unit: any) => unit.lessons).find((entry: any) => entry.id === item.textbookTeachingLessonId);
      if (!teaching?.textbookTeaching || item.kind !== 'practice' || !same(item.targetAtomIds, teaching.targetAtomIds) || item.atomId !== teaching.atomId) fail();
    }
  }
  return records;
}
export function teachingAdoptionStore(state: State): InMemoryStoreService {
  return { find: (name: string, where: any) => (state[name] ?? []).find(compileSelector(where)), select: (name: string, where: any) => (state[name] ?? []).filter(compileSelector(where)),
    inspect: (name: string) => state[name] ?? [] } as unknown as InMemoryStoreService;
}
/** Resolve only the original selected materials. A similar current item is not
 * a replacement for an adopted question/definition/family snapshot. */
export function currentTeachingAdoptionMaterials(store: InMemoryStoreService, recordValue: unknown) {
  const record = assertTeachingAdoption(recordValue), eligible = new Map(eligibleMeasurements(store, record.qualification.targets.map(target => target.atomId)).map(item => [item.id, item])),
    targets = new Map(record.qualification.targets.map(target => [target.atomId, target]));
  if (record.qualification.rules.diagnosis !== DIAGNOSIS_VERSION || record.qualification.rules.familyIdentity !== FAMILY_IDENTITY_VERSION ||
      record.qualification.rules.materialCoverage !== MATERIAL_COVERAGE_VERSION) throw Error('textbook_teaching_adopted_material_changed');
  return record.qualification.materials.map(material => {
    const current = eligible.get(material.measurementId), atom = store.find('knowledgeAtoms', { id: material.atomId }), target = targets.get(material.atomId);
    if (!current || !atom || !target || !same(teachingTargetSnapshot(atom), target) || current.version !== material.version || current.questionId !== material.questionId ||
        current.questionVersion !== material.questionVersion || current.dimension !== material.dimension || current.probeRole !== material.probeRole || current.family !== material.family ||
        canonicalFamily(current) !== material.familyKey || material.familyIdentityVersion !== FAMILY_IDENTITY_VERSION || material.definitionFingerprint !== target.definitionFingerprint ||
        questionContentFingerprint(store, material.questionId) !== material.contentFingerprint) throw Error('textbook_teaching_adopted_material_changed');
    return structuredClone(material);
  });
}
