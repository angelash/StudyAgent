import { assertTeachingAdoption, assertAdoptedTeachingLesson, currentTeachingAdoptionMaterials, teachingAdoptionStore,
  textbookTeachingAdoptionCollection, type TextbookTeachingAdoptionRecord } from './textbook-teaching-adoption';
import { teachingHash } from './textbook-teaching-package';
import { currentTeachingRelease } from './textbook-teaching-release';
import { savedTeachingPreparation, teachingVersionId } from './textbook-teaching-record';

type State = Record<string, any[]>;
type Change = { collection: string; id: string; body: string | null };
const same = (a: unknown, b: unknown) => teachingHash(a) === teachingHash(b), fail = (): never => { throw Error('textbook_teaching_adoption_native_integrity_failed'); };

export function assertTeachingAdoptionAuthority(record: Pick<TextbookTeachingAdoptionRecord,'authorization'|'studentId'|'createdAt'>, state: State, now: number) {
  const proof = record.authorization, actor = state.users?.find(user => teachingHash({ id: user.id }) === proof.actorHash),
    session = state.sessions?.find(session => teachingHash({ id: session.id }) === proof.sessionHash && session.userId === actor?.id);
  if (!actor || actor.status !== 'active' || actor.role !== proof.role || (actor.version ?? 1) !== proof.accountVersion || !session || session.revokedAt ||
      !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= now || !Number.isFinite(Date.parse(session.createdAt)) ||
      Date.parse(record.createdAt) < Date.parse(session.createdAt) || Date.parse(record.createdAt) > now + 5000) fail();
  if (actor.role === 'admin') return actor;
  const bindings = state.bindings ?? [];
  if (actor.role === 'student') {
    const access = state.studentLearningAccess?.find(access => access.studentId === record.studentId && access.userId === actor.id && access.status === 'enabled' && access.version === session.accessVersion),
      guardian = state.users?.find(user => user.id === session.guardianId && user.status === 'active' && ['parent', 'admin'].includes(user.role));
    if (session.studentId !== record.studentId || !state.students?.some(student => student.id === record.studentId && student.userId === actor.id) || !access || !guardian ||
        !proof.learningAccess || proof.learningAccess.version !== access.version || proof.learningAccess.guardianHash !== teachingHash({ id: guardian.id }) ||
        guardian.role !== 'admin' && !bindings.some(binding => binding.parentUserId === guardian.id && binding.studentId === record.studentId && binding.status === 'active')) fail();
  } else if (!bindings.some(binding => binding.parentUserId === actor.id && binding.studentId === record.studentId && binding.status === 'active')) fail();
  return actor;
}

function creation(record: TextbookTeachingAdoptionRecord, before: State, state: State, now: number) {
  const actor = assertTeachingAdoptionAuthority(record, state, now), course = state.studioCourses?.find(course => course.id === record.courseId && course.studentId === record.studentId),
    lesson = course?.units.flatMap((unit: any) => unit.lessons).find((lesson: any) => lesson.id === record.lessonId);
  const upgrade=state.textbookTeachingCourseRevisions?.find(row=>row.courseId===record.courseId&&row.revision===course?.contentRevision&&row.command),isUpgrade=Boolean(before.studioCourses?.some(course=>course.id===record.courseId));
  if (!course || !lesson || isUpgrade&&(!upgrade||before.textbookTeachingCourseRevisions?.some(row=>row.id===upgrade.id)||!same(upgrade.command.authorization,record.authorization)) || record.createdAt !== (isUpgrade?upgrade?.at:course.createdAt)) fail();
  const { snapshot } = assertAdoptedTeachingLesson(record, course, lesson), source = snapshot.source,
    activity = state.studioActivities?.find(activity => activity.kind === (isUpgrade?'course_upgraded':'course_created') && (!isUpgrade||activity.courseRevision===upgrade.revision&&activity.requestKey===upgrade.command.input.requestKey) && activity.referenceId === record.courseId && activity.studentId === record.studentId && activity.actorId === actor.id && activity.subject === course.subject),
    scope = state.learningScopes?.filter(scope => scope.studentId === record.studentId && scope.subject === source.subject).sort((a, b) => b.version - a.version)[0],
    mapping = state.textbookAtomMappings?.find(mapping => mapping.id === record.mapping.id && mapping.version === record.mapping.version && mapping.status === 'approved');
  if (!activity || before.studioActivities?.some(previous => previous.id === activity.id) || !activity.requestKey || !activity.requestHash ||
      !scope || scope.version !== record.scopeVersion || scope.progressMode !== 'textbook' || scope.textbookVolumeId !== source.bookId || scope.textbookRevision !== source.bookVersion ||
      scope.grade !== source.grade || scope.term !== source.term || course.grade !== source.grade || course.subject !== source.subject || course.term !== source.term ||
      !scope.selectedLessonIds.includes(source.lessonId) || !scope.mappingSnapshots?.some((item: any) => same(item, record.mapping)) ||
      record.qualification.targets.some(target => !scope.learnedAtomIds.includes(target.atomId)) || !mapping || mapping.bookId !== source.bookId ||
      mapping.bookVersion !== source.bookVersion || mapping.lessonId !== source.lessonId || !same(mapping.atomIds, record.mapping.atomIds)) fail();
  const store = teachingAdoptionStore(state), header = state.textbookTeachingPackages?.find(header => header.id === record.publicVersion.packageId),
    release = header && currentTeachingRelease(store, header, () => {}), version = header && state.textbookTeachingVersions?.find(version => version.id === teachingVersionId(header.id, record.publicVersion.contentVersion)),
    originalSource = version && state.textbookTeachingSources?.find(source => source.id === version.sourceId), command = version && state.textbookTeachingCommands?.find(command => command.id === version.commandId);
  if (!release?.availability.available || !release.publicBase || !same(record.publicVersion, { packageId: header.id, contentVersion: release.publicBase.contentVersion, fingerprint: snapshot.fingerprint }) ||
      !same(release.publicBase, (({ lesson: _lesson, fingerprint: _fingerprint, ...base }) => base)(snapshot)) || !version || !originalSource || command?.input.action !== 'save') fail();
  const saved = savedTeachingPreparation(version, originalSource, command.input);
  if (!same(record.qualification, { targets: saved.body.targets, materials: saved.body.materials, rules: saved.report.rules })) fail();
  currentTeachingAdoptionMaterials(store, record);
}

/** This guard runs inside the same native transaction as course creation and
 * privacy deletion. Current publication/I/O permission never rewrites an older
 * adopted snapshot or makes the author's private account a lasting dependency. */
export function assertTeachingAdoptionWrites(before: State, current: State, changes: readonly Change[], now: number) {
  for (const change of changes.filter(change => change.collection === textbookTeachingAdoptionCollection)) {
    const old = before.textbookTeachingAdoptions?.find(record => record.id === change.id), next = change.body === null ? null : assertTeachingAdoption(JSON.parse(change.body));
    if (old && next && same(old, next)) continue;
    if (old && next) fail();
    if (old && !next) {
      if (current.students?.some(student => student.id === old.studentId) || current.studioCourses?.some(course => course.id === old.courseId) ||
          !current.privacyRequests?.some(receipt => ['student_delete', 'account_delete'].includes(receipt.kind) && receipt.erasedStudentHashes?.includes(teachingHash({ id: old.studentId })) && Date.parse(receipt.completedAt) >= Date.parse(old.createdAt))) fail();
    } else if (next) creation(next, before, current, now);
  }
}
