import { describe, it, expect } from 'vitest';
import type { DiagnosticSession, DiagnosticStart } from '@study-agent/contracts';
import { teachingCourseFixture } from '../learning/textbook-teaching-course-fixture';
import { buildTextbookTeachingCourse } from '../learning/textbook-teaching-course';
import { teachingHash } from './textbook-teaching-package';
import { teachingAdoptionStore } from './textbook-teaching-adoption';
import { eligibleMeasurements } from './eligible-measurements';
import { selectBlueprintItems } from './assessment-blueprint';
import { adoptedTeachingPractice, currentTeachingPractice, teachingPracticeOrigin, teachingPracticePacket, teachingPracticeRenderPayload,
  teachingPracticeQuestionSnapshot, assertTeachingPracticeSession, assertTeachingPracticeWrites } from './textbook-teaching-practice';
import { portableRecords, studentRecords } from '../privacy/privacy-records';

function fixture() {
  const f = teachingCourseFixture(), built = buildTextbookTeachingCourse(f.value, f.command, 'teaching-practice-course', f.record.createdAt, f.authorization), course = built.course;
  const state: Record<string, any[]> = { students: [{ id: course.studentId }], studioCourses: [course], textbookTeachingAdoptions: built.adoptions,
    learningScopes: [f.value.scope], textbookAtomMappings: f.value.entries.map(entry => ({ ...entry.mapping, status: 'approved', bookId: f.value.book.id, bookVersion: f.value.book.version })) };
  for (const name of ['knowledgeAtoms', 'questions', 'questionSources', 'questionAnswerSchemas', 'measurementItems']) state[name] = structuredClone(f.store.inspect(name as any)) as any[];
  const store = teachingAdoptionStore(state), origin = teachingPracticeOrigin(built.adoptions[0]), current = currentTeachingPractice(store, origin, course.studentId, course.subject, f.value.scope, false),
    coverage: DiagnosticSession['coverage'] = current.record.qualification.targets.map(target => ({ atomId: target.atomId, role: 'target', required: 4, selected: 0 })),
    ids = new Set(current.materials.map(material => material.measurementId)), command: DiagnosticStart = { studentId: course.studentId, subject: course.subject, intent: 'unit', maxItems: 20, includePrerequisites: false, teachingOrigin: origin },
    { selected, blueprint } = selectBlueprintItems(command, eligibleMeasurements(store).filter(item => ids.has(item.id)), coverage, 'native-original-fixture', new Set(), 15, 3),
    packets = selected.map(item => teachingPracticePacket(store, item.questionId));
  const session: DiagnosticSession = { id: 'native-original-practice', studentId: course.studentId, subject: course.subject, intent: 'unit', status: 'in_progress', revision: 1,
    scopeSnapshot: structuredClone(f.value.scope), blueprint, coverage, teachingOrigin: origin, teachingPackets: packets,
    itemIds: selected.map(item => item.id), itemSnapshots: selected, questionSnapshots: packets.map(teachingPracticeQuestionSnapshot), atomSnapshots: structuredClone(state.knowledgeAtoms),
    selectionReasons: {}, seed: 'native-original-fixture', algorithmVersion: blueprint.version, startedAt: f.record.createdAt, completedAt: null, hypothesisId: null, reviewTaskId: null, exposedQuestionIds: [] };
  const before = structuredClone(state); state.diagnosticSessions = [session];
  const changes = [{ collection: 'diagnosticSessions', id: session.id, body: JSON.stringify(session) }]; return { f, state, store, origin, current, session, before, changes };
}
describe('exact adopted material practice and immutable native grading packets', () => {
  it('keeps all eight targets and separates initial checks from the original retention reserve', () => {
    const f = fixture(), reserve = currentTeachingPractice(f.store, f.origin, f.session.studentId, 'math', f.session.scopeSnapshot, true);
    expect(f.current.record.qualification.targets).toHaveLength(8); expect(f.session.coverage).toHaveLength(8); expect(f.session.coverage.every(point => point.selected > 0)).toBe(true);
    expect(f.current.materials).toHaveLength(32); expect(reserve.materials).toHaveLength(128);
    expect(reserve.materials.some(item => item.dimension !== 'retention')).toBe(true);
    const ids = new Set(reserve.materials.map(item => item.measurementId)); expect(f.session.itemIds.every(id => !ids.has(id))).toBe(true);
    expect(() => assertTeachingPracticeSession(f.store, f.session)).not.toThrow(); expect(() => assertTeachingPracticeWrites(f.before, f.state, f.changes)).not.toThrow();
  });
  it('renders an original legacy question without writing a new document or invalidating its adopted packet', () => {
    const f = fixture(), before = teachingHash(f.state), packet = f.session.teachingPackets![0], payload = teachingPracticeRenderPayload(packet);
    expect(packet.document).toBeNull(); expect(payload.document.blocks[0].text).toBe(packet.question.stem); expect(teachingHash(f.state)).toBe(before);
    expect(f.state.questionDocuments ?? []).toEqual([]); expect(() => currentTeachingPractice(f.store, f.origin, f.session.studentId, 'math', f.session.scopeSnapshot, false)).not.toThrow();
  });
  it('retains old grading after a later current answer change but refuses new practice eligibility', () => {
    const f = fixture(); f.state.questions.find(question => question.id === f.session.teachingPackets![0].question.id).answer = 'changed-current-answer';
    expect(() => assertTeachingPracticeSession(f.store, f.session)).not.toThrow(); expect(() => currentTeachingPractice(f.store, f.origin, f.session.studentId, 'math', f.session.scopeSnapshot, false)).toThrow('material_changed');
  });
  it.each(['answer', 'mode', 'render', 'origin', 'first_target', 'retention_material'] as const)('refuses native %s tampering with the original retained session', kind => {
    const f = fixture();
    if (kind === 'answer') f.session.teachingPackets![0].question.answer = 'forged-answer';
    if (kind === 'mode') f.session.teachingPackets![0].answerSchema.mode = 'short_answer';
    if (kind === 'render') (f.session.questionSnapshots[0].renderPayload as any).answerSchema.gradingConfig = { answer: 'forged' };
    if (kind === 'origin') f.session.teachingOrigin!.fingerprint = 'f'.repeat(64);
    if (kind === 'first_target') { f.session.coverage = f.session.coverage.slice(0, 1); f.session.blueprint!.targetAtomIds = f.session.coverage.map(point => point.atomId); }
    if (kind === 'retention_material') { const reserve = currentTeachingPractice(f.store, f.origin, f.session.studentId, 'math', f.session.scopeSnapshot, true).materials[0]; f.session.itemSnapshots[0].id = reserve.measurementId; }
    const before = teachingHash(f.state); expect(() => assertTeachingPracticeSession(f.store, f.session)).toThrow('practice_integrity_failed'); expect(teachingHash(f.state)).toBe(before);
  });
  it('refuses an already exposed original in another session and permits status-only completion without changing the frozen packet', () => {
    const f = fixture(), completed = structuredClone(f.state); completed.diagnosticSessions[0].status = 'completed'; completed.diagnosticSessions[0].completedAt = f.session.startedAt;
    expect(() => assertTeachingPracticeWrites(f.state, completed, f.changes)).not.toThrow();
    f.state.diagnosticSessions.push({ ...structuredClone(f.session), id: 'prior-exposed-session' }); expect(() => assertTeachingPracticeWrites(f.before, f.state, f.changes)).toThrow('native_integrity_failed');
  });
  it('rejects an unconfirmed target while retaining the complete original scope and lesson', () => {
    const f = fixture(), scope = structuredClone(f.session.scopeSnapshot); scope.learnedAtomIds.pop();
    expect(() => currentTeachingPractice(f.store, f.origin, f.session.studentId, 'math', scope, false)).toThrow('当前确认'); expect(adoptedTeachingPractice(f.store, f.origin, f.session.studentId, 'math').record.qualification.targets).toHaveLength(8);
  });
  it('exports only public course and assessment details, withholding original source packets and answer digests', () => {
    const f = fixture(), selected = studentRecords(f.state as any, f.session.studentId), result = portableRecords(selected, 'qa-adopter-parent'), text = JSON.stringify(result);
    expect(text).not.toContain('teachingPackets'); expect(text).not.toContain('textbookTeachingAdoptions'); expect(text).not.toContain(f.f.privateText);
    for (const material of f.current.record.qualification.materials) expect(text).not.toContain(material.contentFingerprint);
    expect((result.diagnosticSessions[0] as any).teachingOrigin).toEqual(f.origin);
  });
});
