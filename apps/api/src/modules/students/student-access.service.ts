import { ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { validate } from '../../common/validation';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { hashToken } from '../auth/auth.service';
import { StudentsService } from './students.service';

const key = z.string().min(8).max(180);
const hashInput = (input: unknown) => createHash('sha256').update(JSON.stringify(input)).digest('hex');
@Injectable()
export class StudentAccessService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService, private readonly events: DomainEventBusService) {}

  get(user: InMemoryUserAccount, studentId: string) {
    this.students.assertGuardian(user, studentId);
    const access = this.store.find('studentLearningAccess', { studentId: studentId });
    return { studentId, status: access?.status ?? 'disabled', version: access?.version ?? 0,
      sessions: this.store.sessions.filter(s => s.studentId === studentId && !s.revokedAt && Date.parse(s.expiresAt) > Date.now())
        .map(({ id, createdAt, expiresAt }) => ({ id, createdAt, expiresAt })),
      codes: this.store.select('studentLearningCodes', { studentId: studentId }).slice(-10).reverse()
        .map(({ id, createdAt, expiresAt, usedAt, revokedAt }) => ({ id, createdAt, expiresAt, usedAt, revokedAt })),
      history: this.store.select('studentAccessRevisions', { studentId: studentId }).slice(-20).reverse()
        .map(({ version, status, actorId, at, reason }) => ({ version, status, actorId, at, reason })) };
  }

  set(user: InMemoryUserAccount, studentId: string, input: unknown) {
    this.students.assertGuardian(user, studentId);
    const command = validate(z.object({ enabled: z.boolean(), expectedVersion: z.number().int().nonnegative(), requestKey: key,
      reason: z.string().trim().min(5).max(1500) }).strict(), input), requestHash = hashInput(command);
    const receipt = this.store.find('studentAccessRevisions', { studentId: studentId, actorId: user.id, requestKey: command.requestKey });
    if (receipt) { if (receipt.requestHash !== requestHash) throw new ConflictException('请求键已用于另一学习权限操作'); return this.get(user, studentId); }
    let access = this.store.find('studentLearningAccess', { studentId: studentId });
    if ((access?.version ?? 0) !== command.expectedVersion) throw new ConflictException('学习权限已变化，请刷新后再确认');
    const at = new Date().toISOString(), child = this.store.find('students', { id: studentId })!;
    if (!access) {
      const userId = this.store.nextId('learner');
      this.store.append('users', { id: userId, principal: `@learner/${userId}`, passwordHash: '', role: 'student', displayName: child.nickname, status: 'disabled' });
      child.userId = userId;
      access = { id: `learning-access:${studentId}`, studentId, userId, status: 'disabled', version: 0, createdAt: at, updatedAt: at, createdBy: user.id };
      this.store.append('studentLearningAccess', access);
    }
    access.status = command.enabled ? 'enabled' : 'disabled'; access.version++; access.updatedAt = at;
    const account = this.store.users.find(u => u.id === access!.userId)!;
    account.status = command.enabled ? 'active' : 'disabled'; account.displayName = child.nickname;
    for (const s of this.store.sessions.filter(s => s.studentId === studentId && !s.revokedAt)) s.revokedAt = at;
    for (const c of this.store.studentLearningCodes.filter(c => c.studentId === studentId && !c.usedAt && !c.revokedAt)) c.revokedAt = at;
    this.store.append('studentAccessRevisions', { id: `${access.id}:v${access.version}`, studentId, version: access.version,
      status: access.status, actorId: user.id, at, reason: command.reason, requestKey: command.requestKey, requestHash });
    this.events.publish('student.learning_access_changed', { studentId, status: access.status, version: access.version, actorId: user.id, reason: command.reason });
    return this.get(user, studentId);
  }

  issueCode(user: InMemoryUserAccount, studentId: string, input: unknown) {
    this.students.assertGuardian(user, studentId);
    const command = validate(z.object({ expectedVersion: z.number().int().positive(), requestKey: key }).strict(), input), requestHash = hashInput(command);
    const previous = this.store.find('studentLearningCodes', { studentId: studentId, createdBy: user.id, requestKey: command.requestKey });
    if (previous) {
      if (previous.requestHash !== requestHash) throw new ConflictException('请求键已用于另一学习码操作');
      return { id: previous.id, code: null, expiresAt: previous.expiresAt, replayed: true };
    }
    const access = this.store.find('studentLearningAccess', { studentId: studentId, status: 'enabled' });
    if (!access || access.version !== command.expectedVersion) throw new ConflictException('请先开启并核对孩子的学习权限');
    if (this.store.studentLearningCodes.filter(c => c.studentId === studentId && Date.parse(c.createdAt) > Date.now() - 15 * 60_000).length >= 10)
      throw new HttpException('学习码生成过于频繁，请稍后再试', 429);
    if (this.store.sessions.filter(s => s.studentId === studentId && !s.revokedAt && Date.parse(s.expiresAt) > Date.now()).length >= 5)
      throw new ConflictException('已有五个设备处于学习状态，请先结束不再使用的设备');
    const at = new Date().toISOString(), code = randomBytes(10).toString('hex');
    for (const previousCode of this.store.studentLearningCodes.filter(c => c.studentId === studentId && !c.usedAt && !c.revokedAt)) previousCode.revokedAt = at;
    const entry = { id: this.store.nextId('learning_code'), studentId, accessVersion: access.version, tokenHash: hashToken(code),
      createdBy: user.id, createdAt: at, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), usedAt: null, revokedAt: null,
      requestKey: command.requestKey, requestHash };
    this.store.append('studentLearningCodes', entry);
    this.events.publish('student.learning_code_issued', { studentId, codeId: entry.id, actorId: user.id, expiresAt: entry.expiresAt });
    return { id: entry.id, code, expiresAt: entry.expiresAt, replayed: false };
  }

  revokeSession(user: InMemoryUserAccount, studentId: string, sessionId: string) {
    this.students.assertGuardian(user, studentId);
    const session = this.store.find('sessions', { id: sessionId, studentId: studentId });
    if (!session) throw new NotFoundException('学习设备会话不存在');
    if (!session.revokedAt) {
      session.revokedAt = new Date().toISOString();
      this.events.publish('student.learning_session_revoked', { studentId, sessionId, actorId: user.id });
    }
    return { revoked: true };
  }
}
