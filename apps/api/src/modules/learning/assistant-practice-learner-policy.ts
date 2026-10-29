import { ConflictException, ForbiddenException } from '@nestjs/common';
import { type PracticeSession } from '@study-agent/contracts';
import { InMemoryStoreService, type InMemoryUserAccount, type InMemoryAuthSession } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';
import { assertCourseAssessmentAvailable } from '../ai/assistant-course-context';
import { captureWhiteboardActorAuthorization } from './topic-whiteboard-access';
import { assertAssistantPracticeAssignment } from './assistant-practice-assignment-record';
import { assertAssistantPracticeGroupStart, assertAssistantPracticeSessionLink } from './assistant-practice-learner-record';

/** A guardian's preview rights are independent of a child's actual answering identity. */
export function assertAssistantPracticeLearner(store: InMemoryStoreService, students: StudentsService,
  user: InMemoryUserAccount, studentId: string, auth: InMemoryAuthSession | undefined) {
  if (user.role !== 'student' || !auth || auth.studentId !== studentId)
    throw new ForbiddenException('请从这个孩子的学习入口本人作答；监护人可以预览教学记录');
  captureWhiteboardActorAuthorization(store, students, user, studentId, auth);
}
export function assistantPracticeSessionRelation(store: InMemoryStoreService, session: PracticeSession) {
  if (session.origin !== 'assistant_artifact' || !session.sourceGroupId || !session.assistantAssignmentId)
    throw new ConflictException('原教学训练关联不完整，请保留输入并核对原安排');
  const start = store.find('assistantPracticeGroupStarts', { id: session.sourceGroupId }), assignment = store.find('assistantPracticeAssignments', { id: session.assistantAssignmentId });
  if (!start || !assignment) throw new ConflictException('原教学安排已不可用，已保存的输入仍保留');
  assertAssistantPracticeGroupStart(start); assertAssistantPracticeAssignment(assignment);
  let group: ReturnType<typeof assertAssistantPracticeSessionLink>;
  try { group = assertAssistantPracticeSessionLink(start, assignment, session); }
  catch { throw new ConflictException('原教学题组关联已变化，请保留输入并核对原记录'); }
  return { start, assignment, group };
}
export function assertAssistantPracticeWriter(store: InMemoryStoreService, students: StudentsService, user: InMemoryUserAccount,
  session: PracticeSession, auth: InMemoryAuthSession | undefined, requireActive = true) {
  assertAssistantPracticeLearner(store, students, user, session.studentId, auth);
  const relation = assistantPracticeSessionRelation(store, session);
  if (relation.start.actorId !== user.id) throw new ForbiddenException('这组训练属于原作答身份，请保留历史并重新核对本人学习入口');
  if (requireActive) {
    if (session.status !== 'in_progress' || relation.assignment.status !== 'assigned') throw new ConflictException('这组训练已结束，请读取原记录并用新题核对');
    assertCourseAssessmentAvailable(store, session.studentId, 'student');
  }
  return relation;
}
