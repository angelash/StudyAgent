import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { InMemoryStoreService, InMemoryUserAccount, InMemoryAuthSession } from '../../infrastructure/in-memory-store.service';
import type { StudentsService } from '../students/students.service';
import { generationDigest } from './source-course-pipeline';

/** Caller enters a fresh transaction before and after an asynchronous synthesis. */
export function studioWhiteboardNarrationContext(store: InMemoryStoreService, students: StudentsService,
  user: InMemoryUserAccount, id: string, session: InMemoryAuthSession) {
  const current = session?.tokenHash && store.find('sessions', { tokenHash: session.tokenHash, userId: user.id });
  if (!current || current.revokedAt || !Number.isFinite(Date.parse(current.expiresAt)) || Date.parse(current.expiresAt) <= Date.now())
    throw new UnauthorizedException('原登录已失效，请重新登录');
  const actor = store.find('users', { id: user.id, status: 'active', role: user.role });
  if (!actor) throw new ForbiddenException('原白板身份已变化');
  const whiteboard = store.find('studioWhiteboards', { id });
  if (!whiteboard) throw new NotFoundException('白板不存在');
  students.assertCanAccessStudent(actor, whiteboard.studentId);
  let authority: object = { role: actor.role, userId: actor.id, sessionTokenHash: current.tokenHash };
  if (actor.role === 'student') {
    const access = store.find('studentLearningAccess', { studentId: whiteboard.studentId, userId: actor.id, status: 'enabled', version: current.accessVersion });
    const guardian = store.find('users', { id: current.guardianId, status: 'active', role: ['parent', 'admin'] });
    const binding = guardian && guardian.role !== 'admin' ? store.find('bindings', { studentId: whiteboard.studentId, parentUserId: guardian.id, status: 'active' }) : undefined;
    if (current.studentId !== whiteboard.studentId || !access || !guardian || guardian.role !== 'admin' && !binding)
      throw new UnauthorizedException('原学习权限已变化，请重新进入');
    authority = { ...authority, accessId: access.id, accessVersion: access.version, guardianId: guardian.id, guardianRole: guardian.role, binding: binding ?? null };
  } else if (actor.role !== 'admin') {
    const binding = store.find('bindings', { studentId: whiteboard.studentId, parentUserId: actor.id, status: 'active' });
    if (!binding) throw new ForbiddenException('原监护关系已变化');
    authority = { ...authority, binding };
  }
  return { whiteboard: structuredClone(whiteboard), definitionHash: generationDigest(whiteboard), authorityHash: generationDigest(authority) };
}
