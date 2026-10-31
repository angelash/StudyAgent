import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { PaperSelectionScope } from '@study-agent/contracts';
import type { AuthenticatedRequest } from '../../common/auth.guard';
import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import type { PaperSelectionAuthorization } from './paper-selection-record';

export type PaperLibraryActor = Pick<AuthenticatedRequest, 'user' | 'authSession'>;
/** The scope comes from the actual current account/session. A parent's child
 * picker is never a substitute for the child's learning identity. */
export function paperLibraryAuthor(store: InMemoryStoreService, request: PaperLibraryActor, expected?: PaperSelectionScope) {
  const actor = store.find('users', { id: request.user.id, status: 'active' });
  const session = store.find('sessions', { id: request.authSession.id, userId: request.user.id });
  if (!actor || actor.role !== request.user.role || !session || session.revokedAt || Date.parse(session.expiresAt) <= Date.now())
    throw new ForbiddenException('当前账号或学习会话已变更，请重新确认身份。');
  let scope: PaperSelectionScope, authorization: PaperSelectionAuthorization;
  if (actor.role === 'student') {
    const studentId = session.studentId, guardianId = session.guardianId, accessVersion = session.accessVersion;
    const student = studentId && store.find('students', { id: studentId, userId: actor.id });
    const access = studentId && store.find('studentLearningAccess', { studentId, userId: actor.id, status: 'enabled', version: accessVersion });
    const guardian = guardianId && store.find('users', { id: guardianId, status: 'active', role: ['parent', 'admin'] });
    if (!student || !access || !guardian || !accessVersion || guardian.role !== 'admin' && !store.find('bindings', { parentUserId: guardian.id, studentId, status: 'active' }))
      throw new ForbiddenException('学习权限或原监护资格已变更，请由家长重新开启。');
    scope = { kind: 'student_self', studentId: student.id };
    authorization = { actorRole: actor.role, actorVersion: actor.version ?? 1, learningAccess: { studentId: student.id, guardianId: guardian.id, accessVersion } };
  } else {
    scope = { kind: 'private_preparation', studentId: null };
    authorization = { actorRole: actor.role, actorVersion: actor.version ?? 1, learningAccess: null };
  }
  if (expected && (scope.kind !== expected.kind || scope.studentId !== expected.studentId)) throw new ForbiddenException('这份清单不属于当前本人学习范围。');
  return { scope, authorization };
}

export function assertPaperDiagnosticAvailable(store: InMemoryStoreService, scope: PaperSelectionScope) {
  if (scope.kind === 'student_self' && store.find('diagnosticSessions', { studentId: scope.studentId, status: 'in_progress' }))
    throw new ConflictException({ code: 'paper_diagnostic_in_progress', message: '请先完成正在进行的正式诊断，再阅读原卷或保留新的选题。原稿和原请求结果仍保留。' });
}
