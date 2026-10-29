import { ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { assistantPracticeGroupStartSchema, type PracticeSession } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, type InMemoryUserAccount, type InMemoryAuthSession } from '../../infrastructure/in-memory-store.service';
import { DomainWriteConflict } from '../../infrastructure/domain-write-conflict';
import { StudentsService } from '../students/students.service';
import { AssistantArtifactService } from '../ai/assistant-artifact.service';
import { assertCourseAssessmentAvailable } from '../ai/assistant-course-context';
import { CurriculumService, eligibleMeasurements } from '../diagnostics/curriculum.service';
import { atomDefinitionFingerprint, questionContentFingerprint } from '../diagnostics/measurement-definition';
import { canonicalFamily } from '../diagnostics/family-identity';
import { originalPaperExposure } from '../diagnostics/paper-exposure';
import { assertAssistantPracticeAssignment, assignmentPayload, type AssistantPracticeAssignmentRecord } from './assistant-practice-assignment-record';
import { assertAssistantPracticeArtifact } from './assistant-practice-record';
import { assistantPracticeAction, assistantPracticeSnapshots, assistantPracticeStartHash, assertAssistantPracticeGroupStart,
  assertAssistantPracticeSessionLink, type AssistantPracticeGroupStartRecord } from './assistant-practice-learner-record';
import { assertAssistantPracticeLearner, assistantPracticeSessionRelation } from './assistant-practice-learner-policy';
import { stableAssistantWhiteboardOrigin } from './assistant-whiteboard-source';
import { LearningService, studyDay } from './learning.service';
import { topicWhiteboardDigest as digest } from './topic-whiteboard-digest';

@Injectable()
export class AssistantPracticeLearnerService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService, private readonly sources: AssistantArtifactService,
    private readonly curriculum: CurriculumService, private readonly learning: LearningService) {}
  private async write<T>(operation: () => T | Promise<T>): Promise<T> {
    for (let index = 0; index < 3; index++) {
      try { return await this.store.transaction(operation); }
      catch (error) { if (!(error instanceof DomainWriteConflict) || index === 2) throw error; }
    }
    throw new ConflictException('训练写入发生冲突，请保留输入并核对原请求');
  }
  private assignment(id: string) {
    const row = this.store.find('assistantPracticeAssignments', { id });
    if (!row) throw new NotFoundException('原教学安排不存在或已不可用');
    return assertAssistantPracticeAssignment(row);
  }
  private assertSourceCurrent(assignment: AssistantPracticeAssignmentRecord) {
    try {
      if (assignment.sourceState !== 'linked' || !assignment.privateOrigin || !assignment.publisherUserId) throw Error();
      const publisher = this.store.find('users', { id: assignment.publisherUserId, role: assignment.publisherRole, status: 'active' });
      const original = this.store.find('assistantPracticeArtifacts', { id: assignment.privateOrigin.artifactId, ownerUserId: assignment.publisherUserId });
      if (!publisher || !original) throw Error();
      const artifact = assertAssistantPracticeArtifact(original), version = artifact.history.find(item => item.revision === assignment.artifactRevision);
      this.students.assertCanAccessStudent(publisher, assignment.studentId);
      if (version?.contentFingerprint !== assignment.artifactContentFingerprint || artifact.studentId !== assignment.studentId || artifact.subject !== assignment.subject
        || artifact.ownerRole !== assignment.publisherRole || digest(assignmentPayload(artifact, assignment.artifactRevision)) !== assignment.payloadFingerprint) throw Error();
      const source = this.sources.readSource(publisher, artifact.sourceSessionId, { kind: 'verbatim_note', selection: artifact.createInput.selection, objective: artifact.createInput.objective });
      if (digest(stableAssistantWhiteboardOrigin(source.origin)) !== artifact.bank.source.sourceFingerprint
        || (source.origin.course?.current === false || source.origin.lecture?.current === false) && !artifact.createInput.acknowledgeHistoricalSource) throw Error();
    } catch { throw new ConflictException('这组的原来源或安排者权限已变化，请重新核对；已开始的教学记录仍保留'); }
  }
  private assertGroupCurrent(user: InMemoryUserAccount, assignment: AssistantPracticeAssignmentRecord, atomId: string) {
    const group = assignment.payload.groups.find(item => item.atomSnapshot.id === atomId);
    if (!group) throw new NotFoundException('知识点不属于这份教学安排');
    const scope = this.curriculum.getScope(user, assignment.studentId, assignment.subject);
    const atom = this.store.find('knowledgeAtoms', { id: atomId, subject: assignment.subject, status: 'published' });
    if (!scope || digest(scope) !== assignment.payload.scopeFingerprint || !atom || atomDefinitionFingerprint(atom) !== group.definitionFingerprint)
      throw new ConflictException('当前已学范围或原子点定义已变化，请核对原安排；没有自动替换题目');
    const mappings = eligibleMeasurements(this.store, [atomId]);
    for (const packet of group.questions) {
      const mapping = mappings.find(item => item.id === packet.mapping.id), publication = this.store.find('measurementCandidates', { questionId: packet.question.id });
      if (!mapping || digest(mapping) !== digest(packet.mapping) || questionContentFingerprint(this.store, packet.question.id) !== packet.contentFingerprint
        || publication && (publication.status !== 'published' || publication.publishedHash !== packet.contentFingerprint)
        || packet.publication && (publication?.id !== packet.publication.candidateId || publication.publishedHash !== packet.publication.publishedHash))
        throw new ConflictException('本组原题、审核映射或发布版本已变化，请保留安排并重新核对');
    }
    const diagnostics = this.store.select('diagnosticSessions', { studentId: assignment.studentId });
    const externalPractices = this.store.select('practiceSessions', { studentId: assignment.studentId }).filter(session => {
      if (session.origin !== 'assistant_artifact' || session.assistantAssignmentId !== assignment.id || !session.sourceGroupId) return true;
      const start = this.store.find('assistantPracticeGroupStarts', { id: session.sourceGroupId, assignmentId: assignment.id, practiceSessionId: session.id });
      if (!start) return true;
      assertAssistantPracticeGroupStart(start); assertAssistantPracticeSessionLink(start, assignment, session); return false;
    });
    const seen = new Set([...diagnostics.flatMap(session => session.questionSnapshots.map(item => item.id)),
      ...externalPractices.flatMap(session => session.questionIds), ...originalPaperExposure(this.store, assignment.studentId)]);
    const originalMappings = [...this.store.select('measurementItems', { atomId }), ...diagnostics.flatMap(session => session.itemSnapshots ?? []).filter(item => item.atomId === atomId),
      ...externalPractices.flatMap(session => session.itemSnapshots ?? []).filter(item => item.atomId === atomId)];
    const seenFamilies = new Set(originalMappings.filter(item => seen.has(item.questionId)).map(canonicalFamily));
    if (group.questions.some(item => seen.has(item.question.id) || seenFamilies.has(canonicalFamily(item.mapping))))
      throw new ConflictException('本组题目或结构已在其他活动中曝光，请重新核对；没有自动换题');
    return group;
  }
  start(user: InMemoryUserAccount, assignmentId: string, atomId: string, value: unknown, auth: InMemoryAuthSession) {
    const input = validate(assistantPracticeGroupStartSchema, value), requestHash = assistantPracticeStartHash(user.id, assignmentId, atomId, input);
    return this.write(() => {
      const assignment = this.assignment(assignmentId); assertAssistantPracticeLearner(this.store, this.students, user, assignment.studentId, auth);
      const previous = this.store.find('assistantPracticeGroupStarts', { actorId: user.id, requestKey: input.requestKey });
      if (previous) {
        assertAssistantPracticeGroupStart(previous);
        if (previous.requestHash !== requestHash) throw new ConflictException('原开始请求已用于不同的安排、知识点或版本');
        const session = this.store.find('practiceSessions', { id: previous.practiceSessionId });
        if (!session) throw new ConflictException('原训练关联已不可用，请核对原安排');
        assertAssistantPracticeSessionLink(previous, assignment, session); return structuredClone(previous.receipt);
      }
      if (this.store.find('assistantPracticeGroupStarts', { assignmentId, atomId })) throw new ConflictException('这一组已经开始，请打开安排中的原训练；没有另建活动');
      if (input.assignmentFingerprint !== assignment.payloadFingerprint) throw new ConflictException('安排版本已变化，请先核对完整教学内容');
      assertCourseAssessmentAvailable(this.store, assignment.studentId, 'student'); this.assertSourceCurrent(assignment);
      const group = this.assertGroupCurrent(user, assignment, atomId), now = new Date().toISOString(), id = this.store.nextId('assistant-practice-group'), sessionId = this.store.nextId('practice');
      const groupFingerprint = digest(group), receipt = { assignmentId, atomId, sessionId, groupFingerprint, at: now };
      const start: AssistantPracticeGroupStartRecord = { id, protocol: 'assistant-practice-group-start-v1', assignmentId, studentId: assignment.studentId,
        subject: assignment.subject, atomId, actorId: user.id, actorRole: 'student', actorStudentId: assignment.studentId,
        assignmentFingerprint: assignment.payloadFingerprint, groupFingerprint, practiceSessionId: sessionId, input: structuredClone(input),
        requestKey: input.requestKey, requestHash, createdAt: now, receipt, commands: [] };
      const session: PracticeSession = { id: sessionId, studentId: assignment.studentId, subject: assignment.subject, planId: null, actionId: id,
        atomId, day: studyDay(), status: 'in_progress', questionIds: group.questions.map(item => item.question.id), snapshots: assistantPracticeSnapshots(group),
        createdAt: now, completedAt: null, origin: 'assistant_artifact', assistantAssignmentId: assignmentId, sourceGroupId: id,
        atomSnapshot: structuredClone(group.atomSnapshot), actionSnapshot: assistantPracticeAction(assignment, atomId, id), planRevision: 0, snapshotOrigin: 'started',
        itemSnapshots: structuredClone(group.questions.map(item => item.mapping)), familyIdentityVersion: assignment.payload.familyIdentityVersion };
      assertAssistantPracticeGroupStart(start); assertAssistantPracticeSessionLink(start, assignment, session);
      this.store.append('assistantPracticeGroupStarts', start); this.store.append('practiceSessions', session); return structuredClone(receipt);
    });
  }
  eligibility(user: InMemoryUserAccount, assignment: AssistantPracticeAssignmentRecord, auth: InMemoryAuthSession) {
    this.students.assertCanAccessStudent(user, assignment.studentId);
    const groups = assignment.payload.groups.map(group => {
      const atomId = group.atomSnapshot.id, start = this.store.find('assistantPracticeGroupStarts', { assignmentId: assignment.id, atomId });
      if (start) {
        const session = this.store.find('practiceSessions', { id: start.practiceSessionId });
        if (!session) throw new ConflictException('原训练关联已不可用，请保留记录并核对安排');
        assertAssistantPracticeGroupStart(start); assertAssistantPracticeSessionLink(start, assignment, session);
        return { atomId, sessionId: session.id, status: session.status, canStart: false, blocked: null };
      }
      try {
        assertAssistantPracticeLearner(this.store, this.students, user, assignment.studentId, auth);
        assertCourseAssessmentAvailable(this.store, assignment.studentId, 'student'); this.assertSourceCurrent(assignment); this.assertGroupCurrent(user, assignment, atomId);
        return { atomId, sessionId: null, status: 'not_started' as const, canStart: true, blocked: null };
      } catch (error) {
        if (!(error instanceof HttpException)) throw error;
        const body = error.getResponse(), message = typeof body === 'string' ? body : (body as { message?: unknown }).message;
        return { atomId, sessionId: null, status: 'not_started' as const, canStart: false,
          blocked: { code: user.role !== 'student' ? 'learner_required' : 'current_context_changed', message: typeof message === 'string' ? message : '请保留原安排并核对当前学习入口' } };
      }
    });
    return { eligibilityChecked: true, startingAvailable: groups.some(group => group.canStart), groupActivities: groups };
  }
  private sourceSession(user: InMemoryUserAccount, id: string) {
    const session = this.store.find('practiceSessions', { id, origin: 'assistant_artifact' });
    if (!session) throw new NotFoundException('本人教学训练不存在或已不可用');
    this.students.assertCanAccessStudent(user, session.studentId); assistantPracticeSessionRelation(this.store, session); return session;
  }
  view(user: InMemoryUserAccount, id: string, auth: InMemoryAuthSession) { this.sourceSession(user, id); return this.learning.view(user, id, auth); }
  render(user: InMemoryUserAccount, id: string, questionId: string, auth: InMemoryAuthSession) { this.sourceSession(user, id); return this.learning.render(user, id, questionId, auth); }
  draft(user: InMemoryUserAccount, id: string, questionId: string, value: unknown, auth: InMemoryAuthSession) { return this.write(() => { this.sourceSession(user, id); return this.learning.draft(user, id, questionId, value, auth); }); }
  submit(user: InMemoryUserAccount, id: string, value: unknown, auth: InMemoryAuthSession) { return this.write(() => { this.sourceSession(user, id); return this.learning.submit(user, id, value, auth); }); }
  help(user: InMemoryUserAccount, id: string, questionId: string, value: unknown, auth: InMemoryAuthSession) { return this.write(() => { this.sourceSession(user, id); return this.learning.assistantPracticeHelp(user, id, questionId, value, auth); }); }
  complete(user: InMemoryUserAccount, id: string, value: unknown, auth: InMemoryAuthSession) { return this.write(() => { this.sourceSession(user, id); return this.learning.complete(user, id, value, auth); }); }
}
