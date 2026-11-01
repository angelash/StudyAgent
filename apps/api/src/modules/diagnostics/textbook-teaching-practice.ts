import { textbookTeachingPracticeOriginSchema, type DiagnosticSession, type LearningScope, type QuestionRenderPayload,
  type TextbookTeachingPracticeOrigin, type TextbookTeachingQuestionPacket, type Subject } from '@study-agent/contracts';
import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { assertAdoptedTeachingLesson, currentTeachingAdoptionMaterials, teachingAdoptionStore, type TextbookTeachingAdoptionRecord } from './textbook-teaching-adoption';
import { teachingHash } from './textbook-teaching-package';
import { atomDefinitionFingerprint, questionPacketContentFingerprint } from './measurement-definition';
import { originalPaperExposure } from './paper-exposure';
import { retainedCourseLesson } from '../learning/studio-course-history-lookup';

const same = (a: unknown, b: unknown) => teachingHash(a) === teachingHash(b);
export function teachingPracticeOrigin(record: TextbookTeachingAdoptionRecord): TextbookTeachingPracticeOrigin {
  return { protocol: 'textbook-teaching-practice-v1', courseId: record.courseId, lessonId: record.lessonId, ...record.publicVersion };
}
export function adoptedTeachingPractice(store: InMemoryStoreService, origin: TextbookTeachingPracticeOrigin, studentId: string, subject: Subject) {
  const retained=retainedCourseLesson({studioCourses:store.select('studioCourses',{id:origin.courseId,studentId,subject}),textbookTeachingCourseRevisions:store.select('textbookTeachingCourseRevisions',{courseId:origin.courseId,studentId})},origin.courseId,origin.lessonId,studentId,subject),course=retained?.course,lesson=retained?.lesson,
    value = store.find('textbookTeachingAdoptions', { courseId: origin.courseId, lessonId: origin.lessonId, studentId });
  if (!course || !lesson) throw Error('原教学课程或课时无法核对，请保留原入口');
  const { record, snapshot } = assertAdoptedTeachingLesson(value, course, lesson);
  if (!same(origin, textbookTeachingPracticeOriginSchema.parse(origin)) || !same(origin, teachingPracticeOrigin(record))) throw Error('练习对应的准确教学版本已改变，请返回原课程核对');
  return { course, lesson, record, snapshot };
}
export function currentTeachingPractice(store: InMemoryStoreService, origin: TextbookTeachingPracticeOrigin, studentId: string, subject: Subject, scope: LearningScope, retest: boolean) {
  const value = adoptedTeachingPractice(store, origin, studentId, subject), { record, snapshot } = value,
    mapping = store.find('textbookAtomMappings', { id: record.mapping.id, version: record.mapping.version, status: 'approved' });
  if (scope.studentId !== studentId || scope.subject !== subject || scope.progressMode !== 'textbook' || scope.textbookVolumeId !== snapshot.source.bookId || scope.textbookRevision !== snapshot.source.bookVersion ||
      scope.grade !== snapshot.source.grade || scope.term !== snapshot.source.term || !scope.selectedLessonIds.includes(snapshot.source.lessonId) ||
      !scope.mappingSnapshots?.some(item => same(item, record.mapping)) || !mapping || mapping.bookId !== snapshot.source.bookId || mapping.bookVersion !== snapshot.source.bookVersion ||
      mapping.lessonId !== snapshot.source.lessonId || !same(mapping.atomIds, record.mapping.atomIds) || record.qualification.targets.some(target => !scope.learnedAtomIds.includes(target.atomId)))
    throw Error('本课已不在当前确认的准确教材范围内，请先核对学习进度');
  const materials = currentTeachingAdoptionMaterials(store, record), checks = snapshot.content.checks.filter(check => retest ? check.purpose === 'retention' : check.purpose !== 'retention'),
    ids = new Set(checks.flatMap(check => check.materials.map(material => material.measurementId)));
  return { ...value, checks, materials: materials.filter(material => ids.has(material.measurementId)) };
}
export function teachingPracticePacket(store: InMemoryStoreService, questionId: string): TextbookTeachingQuestionPacket {
  const question = store.find('questions', { id: questionId }), answerSchema = store.find('questionAnswerSchemas', { questionId }), source = store.find('questionSources', { questionId });
  if (!question || !answerSchema || !source) throw Error('原材料的完整作答配置无法核对');
  return structuredClone({ question, document: store.find('questionDocuments', { questionId }) ?? null, answerSchema, source });
}
/** The original legacy question can lack a document. Rendering it must not
 * create a new document and silently invalidate its already adopted digest. */
export function teachingPracticeRenderPayload(packet: TextbookTeachingQuestionPacket): QuestionRenderPayload {
  const { question } = packet;
  return structuredClone({ question: { id: question.id, subject: question.subject, type: question.type, difficultyLevel: question.difficultyLevel, status: question.status },
    document: packet.document ?? { questionId: question.id, version: 1, locale: 'zh-CN', blocks: [{ id: 'teaching-legacy:' + question.id, type: 'text', text: question.stem }],
      attachments: [], layoutMode: 'default', accessibilityConfig: {} }, answerSchema: packet.answerSchema, source: packet.source });
}
export function teachingPracticeQuestionSnapshot(packet: TextbookTeachingQuestionPacket): DiagnosticSession['questionSnapshots'][number] {
  const payload = teachingPracticeRenderPayload(packet), { question } = packet;
  return structuredClone({ id: question.id, stem: question.stem, answer: question.answer, analysis: question.analysis,
    document: payload.document, answerSchema: payload.answerSchema, renderPayload: payload, questionType: question.type });
}
/** Historic checks use only the independent retained qualification and complete
 * source packets, never an author's account or a later changed question. */
export function assertTeachingPracticeSession(store: InMemoryStoreService, session: DiagnosticSession) {
  if (!session.teachingOrigin && !session.teachingPackets) return;
  try {
    if (!session.teachingOrigin || !session.teachingPackets) throw Error();
    const { record, snapshot } = adoptedTeachingPractice(store, session.teachingOrigin, session.studentId, session.subject),
      checks = snapshot.content.checks.filter(check => session.intent === 'retest' ? check.purpose === 'retention' : check.purpose !== 'retention'),
      allowed = new Set(checks.flatMap(check => check.materials.map(material => material.measurementId))), materials = new Map(record.qualification.materials.map(material => [material.measurementId, material])),
      targetIds = record.qualification.targets.map(target => target.atomId), targets = session.coverage.map(point => point.atomId);
    if (!['unit', 'verification', 'retest'].includes(session.intent) || session.scopeSnapshot.studentId !== session.studentId || session.scopeSnapshot.subject !== session.subject ||
        session.scopeSnapshot.textbookVolumeId !== snapshot.source.bookId || session.scopeSnapshot.textbookRevision !== snapshot.source.bookVersion ||
        !targets.length || targets.some(id => !targetIds.includes(id)) || !session.planId && session.intent !== 'retest' && !same(targets, targetIds) ||
        !same(session.blueprint?.targetAtomIds, targets) || session.itemIds.length !== session.itemSnapshots.length || session.itemIds.length !== session.questionSnapshots.length ||
        session.itemIds.length !== session.teachingPackets.length || new Set(session.itemIds).size !== session.itemIds.length ||
        new Set(session.questionSnapshots.map(question => question.id)).size !== session.itemIds.length) throw Error();
    for (const [index, item] of session.itemSnapshots.entries()) {
      const material = materials.get(item.id), packet = session.teachingPackets[index], atom = session.atomSnapshots?.find(atom => atom.id === item.atomId);
      if (!material || !allowed.has(item.id) || item.id !== session.itemIds[index] || item.questionId !== material.questionId || item.version !== material.version || item.questionVersion !== material.questionVersion ||
          item.dimension !== material.dimension || item.probeRole !== material.probeRole || item.family !== material.family || item.atomId !== material.atomId || !targets.includes(item.atomId) ||
          !atom || atomDefinitionFingerprint(atom) !== material.definitionFingerprint || item.contentFingerprint !== material.contentFingerprint ||
          packet?.question.id !== item.questionId || questionPacketContentFingerprint(packet) !== material.contentFingerprint ||
          !same(session.questionSnapshots[index], teachingPracticeQuestionSnapshot(packet))) throw Error();
    }
  } catch (cause) { throw Error('textbook_teaching_practice_integrity_failed', { cause }); }
}

export function assertTeachingPracticeWrites(before: Record<string, any[]>, state: Record<string, any[]>, changes: readonly { collection: string; id: string; body: string | null }[]) {
  const store = teachingAdoptionStore(state), immutable = (session: DiagnosticSession) => {
    const { status: _status, revision: _revision, routing: _routing, completedAt: _completed, endedAt: _ended, stateHistory: _history, ...frozen } = session; return frozen;
  };
  for (const change of changes.filter(change => change.collection === 'diagnosticSessions')) {
    const old = before.diagnosticSessions?.find(session => session.id === change.id), next = state.diagnosticSessions?.find(session => session.id === change.id);
    if (!old?.teachingOrigin && !old?.teachingPackets && !next?.teachingOrigin && !next?.teachingPackets) continue;
    try {
      if (!next) {
        if (state.students?.some(student => student.id === old.studentId) || !state.privacyRequests?.some(receipt => receipt.erasedStudentHashes?.includes(teachingHash({ id: old.studentId })))) throw Error();
        continue;
      }
      assertTeachingPracticeSession(store, next);
      if (old) { if (!same(immutable(old), immutable(next))) throw Error(); continue; }
      const scope = state.learningScopes?.filter(scope => scope.studentId === next.studentId && scope.subject === next.subject).sort((a, b) => b.version - a.version)[0];
      if (!scope) throw Error();
      if (next.intent === 'retest' && (!next.reviewTaskId || !next.planId)) throw Error();
      const resolved = currentTeachingPractice(store, next.teachingOrigin!, next.studentId, next.subject, scope, next.intent === 'retest'),
        allowed = new Set(resolved.materials.map(material => material.measurementId)), seen = new Set([
          ...(state.diagnosticSessions ?? []).filter(session => session.id !== next.id && session.studentId === next.studentId).flatMap(session => session.questionSnapshots.map((question: any) => question.id)),
          ...(state.practiceSessions ?? []).filter(session => session.studentId === next.studentId).flatMap(session => session.questionIds), ...originalPaperExposure(store, next.studentId),
        ]);
      if (next.itemSnapshots.some((item: any) => !allowed.has(item.id) || seen.has(item.questionId)) || next.exposedQuestionIds?.length) throw Error();
    } catch (cause) { throw Error('textbook_teaching_practice_native_integrity_failed', { cause }); }
  }
}
