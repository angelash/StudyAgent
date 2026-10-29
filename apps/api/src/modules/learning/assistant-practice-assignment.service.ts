import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { assistantPracticeAssignSchema, assistantPracticeAssignmentsQuerySchema, type AssistantPracticeAssignmentReceipt } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { DomainWriteConflict } from '../../infrastructure/domain-write-conflict';
import { InMemoryStoreService, type InMemoryAuthSession, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';
import { captureWhiteboardActorAuthorization } from './topic-whiteboard-access';
import { AssistantPracticeArtifactService } from './assistant-practice-artifact.service';
import { AssistantPracticeLearnerService } from './assistant-practice-learner.service';
import { topicWhiteboardDigest as digest } from './topic-whiteboard-digest';
import { assignmentArtifactIdentity, assignmentPayload, assignmentPublisherFingerprint, assignmentRequestHash, assignmentSummary, assignmentView,
  assertAssistantPracticeAssignment, type AssistantPracticeAssignmentRecord } from './assistant-practice-assignment-record';

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
@Injectable()
export class AssistantPracticeAssignmentService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService,
    private readonly artifacts: AssistantPracticeArtifactService, private readonly learners: AssistantPracticeLearnerService) {}
  private authority(user: InMemoryUserAccount, studentId: string, auth: InMemoryAuthSession) {
    return captureWhiteboardActorAuthorization(this.store, this.students, user, studentId, auth);
  }
  private async write<T>(operation: () => T | Promise<T>): Promise<T> {
    for (let index = 0; index < 3; index++) {
      try { return await this.store.transaction(operation); }
      catch (error) { if (!(error instanceof DomainWriteConflict) || index === 2) throw error; }
    }
    throw new ConflictException('安排写入发生冲突，请使用原请求核对');
  }
  async assign(user: InMemoryUserAccount, artifactId: string, value: unknown, auth: InMemoryAuthSession): Promise<AssistantPracticeAssignmentReceipt> {
    const publisherRole = user.role;
    if (publisherRole !== 'parent' && publisherRole !== 'student' && publisherRole !== 'admin')
      throw new ForbiddenException('当前练习安排仅面向监护人、本人学习入口和内部管理员');
    const input = validate(assistantPracticeAssignSchema, value), publisherFingerprint = assignmentPublisherFingerprint(user.id), artifactIdentityHash = assignmentArtifactIdentity(artifactId),
      requestHash = assignmentRequestHash(publisherFingerprint, artifactIdentityHash, input);
    return this.write(() => {
      // Check the private owner before looking up a child or another publisher's commands.
      const original = this.artifacts.assignmentSource(user, artifactId, auth, false);
      this.authority(user, input.studentId, auth);
      const previous = this.store.find('assistantPracticeAssignments', { publisherFingerprint, requestKey: input.requestKey });
      if (previous) {
        if (previous.requestHash !== requestHash) throw new ConflictException('原安排请求已用于不同的候选、目标或版本');
        assertAssistantPracticeAssignment(previous); return structuredClone(previous.receipt);
      }
      if (input.studentId !== original.studentId) throw new ConflictException('安排的孩子与原候选不一致，请保留原稿并重新核对');
      const artifact = this.artifacts.assignmentSource(user, artifactId, auth, true);
      if (artifact.revision !== input.expectedRevision || artifact.contentFingerprint !== input.contentFingerprint)
        throw new ConflictException('原候选或说明版本已变化，请核对完整题组后明确安排');
      const payload = assignmentPayload(artifact), payloadFingerprint = digest(payload), now = new Date().toISOString(), id = this.store.nextId('assistant-practice-assignment');
      const receipt = { assignmentId: id, payloadFingerprint, at: now };
      const row: AssistantPracticeAssignmentRecord = { id, protocol: 'assistant-practice-assignment-v1', status: 'assigned', studentId: input.studentId,
        subject: artifact.subject, publisherUserId: user.id, publisherRole, publisherFingerprint, artifactIdentityHash,
        artifactRevision: artifact.revision, artifactContentFingerprint: artifact.contentFingerprint, privateOrigin: { artifactId, publisherUserId: user.id },
        sourceState: 'linked', payload, payloadFingerprint, createInput: structuredClone(input), requestKey: input.requestKey, requestHash, receipt, createdAt: now };
      assertAssistantPracticeAssignment(row); this.store.append('assistantPracticeAssignments', row); return structuredClone(receipt);
    });
  }
  list(user: InMemoryUserAccount, value: unknown, auth: InMemoryAuthSession) {
    const input = validate(assistantPracticeAssignmentsQuerySchema, value); this.authority(user, input.studentId, auth);
    const rows = this.store.select('assistantPracticeAssignments', { studentId: input.studentId, subject: input.subject });
    if (rows.length > 10000) throw new BadRequestException('安排列表超过检索预算，请保留原位置；没有截断记录');
    rows.sort((a, b) => compare(b.createdAt, a.createdAt) || compare(b.id, a.id)); let start = 0;
    if (input.cursor) {
      let cursor: string[];
      try {
        const bytes = Buffer.from(input.cursor, 'base64url'); if (bytes.toString('base64url') !== input.cursor) throw Error();
        cursor = JSON.parse(bytes.toString('utf8'));
        if (!Array.isArray(cursor) || cursor.length !== 5 || cursor[0] !== 'assistant-practice-assignment-page-v1'
          || cursor[1] !== user.id || cursor[2] !== input.studentId || cursor[3] !== input.subject || typeof cursor[4] !== 'string') throw Error();
      } catch { throw new BadRequestException('原安排列表位置不属于当前账号、孩子或学科，请重新读取'); }
      const found = rows.findIndex(row => row.id === cursor[4]); if (found < 0) throw new ConflictException('原列表位置已变化，请保留原件并重新读取'); start = found + 1;
    }
    const page = rows.slice(start, start + input.pageSize); page.forEach(assertAssistantPracticeAssignment);
    return { items: page.map(assignmentSummary), nextCursor: start + page.length < rows.length
      ? Buffer.from(JSON.stringify(['assistant-practice-assignment-page-v1', user.id, input.studentId, input.subject, page.at(-1)!.id])).toString('base64url') : null };
  }
  get(user: InMemoryUserAccount, id: string, auth: InMemoryAuthSession) {
    const row = this.store.find('assistantPracticeAssignments', { id });
    if (!row) throw new NotFoundException('这份教学安排不存在或当前账号无法访问');
    this.authority(user, row.studentId, auth); assertAssistantPracticeAssignment(row);
    return { ...assignmentView(row, user.role !== 'student'), ...this.learners.eligibility(user, row, auth) };
  }
}
