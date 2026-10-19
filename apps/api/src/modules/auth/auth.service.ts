import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { hash, compare } from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { credentialsSchema, validate } from '../../common/validation';
import { z } from 'zod';
import { RateLimitService } from '../../infrastructure/rate-limit.service';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly store: InMemoryStoreService,
    private readonly eventBus: DomainEventBusService,
    private readonly limits: RateLimitService,
  ) {}

  private rateLimit(key: string) { return this.limits.assert(`auth:${key}`, 30, 15 * 60_000); }

  async register(input: unknown, address = 'local') {
    const command = validate(credentialsSchema, input);
    await this.rateLimit(`register:${address}`);
    if (this.store.users.some((item) => item.principal === command.principal)) {
      throw new ConflictException('无法创建该账号，请登录或更换账号');
    }
    const user: InMemoryUserAccount = {
      id: this.store.nextId('user'), principal: command.principal,
      passwordHash: await hash(command.credential, 12), role: 'parent',
      displayName: command.principal.split('@')[0], status: 'active',
    };
    this.store.users.push(user);
    this.eventBus.publish('auth.registered', { userId: user.id, role: user.role });
    return this.createSession(user);
  }

  async login(input: unknown, address = 'local') {
    const command = validate(credentialsSchema, input);
    const key = `login:${address}:${command.principal}`;
    await this.limits.assert(`auth:login-ip:${address}`, 300, 15 * 60_000);
    await this.rateLimit(key);
    const user = this.store.users.find((item) => item.principal === command.principal);
    const valid = await compare(command.credential, user?.passwordHash ?? '$2b$12$pAxqI0sYiLqor2F0ILhL1.I9/lYcflo6QwYV6jkz41p0d4ESJ8rN2');
    if (!user || !valid || user.status !== 'active' || user.role === 'student') throw new UnauthorizedException('账号或密码不正确');
    await this.limits.reset(`auth:${key}`);
    return this.createSession(user);
  }

  logout(token: string) {
    const session = this.store.sessions.find((item) => item.tokenHash === hashToken(token));
    if (session) session.revokedAt = new Date().toISOString();
    return { loggedOut: true };
  }

  async reauthenticate(user: InMemoryUserAccount, credential: string, purpose: string) {
    await this.rateLimit(`reauth:${purpose}:${user.id}`);
    if (!credential || !(await compare(credential, user.passwordHash))) throw new UnauthorizedException('当前账号密码不正确');
  }

  async redeemLearningCode(input: unknown, address = 'local') {
    const { code } = validate(z.object({ code: z.string().trim().min(20).max(40).transform(s => s.replace(/\s/g, '').toLowerCase()) }).strict(), input);
    await this.limits.assert(`auth:learning-code:${address}`, 300, 15 * 60_000);
    const tokenHash = hashToken(code);
    await this.rateLimit(`learning-code-value:${tokenHash}`);
    const entry = this.store.studentLearningCodes.find(c => c.tokenHash === tokenHash && !c.usedAt && !c.revokedAt && Date.parse(c.expiresAt) > Date.now());
    const access = entry && this.store.studentLearningAccess.find(a => a.studentId === entry.studentId && a.status === 'enabled' && a.version === entry.accessVersion);
    const user = access && this.store.users.find(u => u.id === access.userId && u.role === 'student' && u.status === 'active');
    const guardian = entry && this.store.users.find(u => u.id === entry.createdBy && u.status === 'active' && ['parent', 'admin'].includes(u.role));
    const bound = guardian && (guardian.role === 'admin' || this.store.bindings.some(b => b.parentUserId === guardian.id && b.studentId === entry!.studentId && b.status === 'active'));
    if (!entry || !access || !user || !bound) throw new UnauthorizedException('学习码不可用或已过期，请家长重新生成');
    entry.usedAt = new Date().toISOString();
    const result = this.createSession(user, { studentId: entry.studentId, guardianId: entry.createdBy, accessVersion: access.version, lifetimeMs: 8 * 3600_000 });
    this.eventBus.publish('student.learning_code_used', { studentId: entry.studentId, codeId: entry.id, userId: user.id });
    return result;
  }

  listAccounts(actor: InMemoryUserAccount, input: unknown) {
    if (actor.role !== 'admin') throw new ForbiddenException('需要管理员权限');
    const query = validate(z.object({ search: z.string().trim().max(254).default(''),
      page: z.coerce.number().int().min(1).max(100000).default(1) }).strict(), input);
    const rows = this.store.users.filter((u) => !query.search || u.principal.includes(query.search.toLowerCase()) || u.displayName.includes(query.search));
    return { total: rows.length, page: query.page, rows: rows.slice((query.page - 1) * 25, query.page * 25).map(({ id, principal, displayName, role, status, version }) =>
      ({ id, principal, displayName, role, status, version: version ?? 1 })) };
  }

  async updateAccount(actor: InMemoryUserAccount, id: string, input: unknown) {
    if (actor.role !== 'admin') throw new ForbiddenException('需要管理员权限');
    const command = validate(z.object({ role: z.enum(['parent', 'teacher', 'operator', 'admin']), status: z.enum(['active', 'disabled']),
      expectedVersion: z.number().int().positive(), reason: z.string().trim().min(5).max(2000), adminCredential: z.string().min(10).max(128) }).strict(), input);
    await this.rateLimit(`account-change:${actor.id}`);
    if (!(await compare(command.adminCredential, actor.passwordHash))) throw new UnauthorizedException('管理员密码不正确');
    const target = this.store.users.find((item) => item.id === id);
    if (!target) throw new NotFoundException('账号不存在');
    if ((target.version ?? 1) !== command.expectedVersion) throw new ConflictException('账号权限已变更，请重新读取后核对');
    if (target.role === 'student') throw new BadRequestException('学生身份需通过监护人的学习账号管理');
    if (id === actor.id && (command.role !== actor.role || command.status !== 'active')) throw new BadRequestException('不能在当前会话撤销自己的管理权限');
    if (target.role === 'admin' && (command.role !== 'admin' || command.status !== 'active') &&
      this.store.users.filter((u) => u.role === 'admin' && u.status === 'active' && u.id !== id).length === 0) throw new BadRequestException('至少保留一个可用管理员');
    const previous = { role: target.role, status: target.status, version: target.version ?? 1 };
    target.role = command.role; target.status = command.status; target.version = previous.version + 1;
    if (previous.role !== target.role || previous.status !== target.status) {
      for (const session of this.store.sessions.filter((s) => s.userId === id && !s.revokedAt)) session.revokedAt = new Date().toISOString();
      if (previous.role === 'teacher' && (target.role !== 'teacher' || target.status !== 'active')) {
        for (const assignment of this.store.teacherAssignments.filter((a) => a.teacherUserId === id && a.status === 'active')) {
          assignment.status = 'revoked'; assignment.revokedAt = new Date().toISOString(); assignment.revokedBy = actor.id;
        }
      }
    }
    this.eventBus.publish('auth.account_updated', { userId: id, actorId: actor.id, previous,
      current: { role: target.role, status: target.status, version: target.version }, reason: command.reason });
    return { id: target.id, principal: target.principal, displayName: target.displayName, role: target.role, status: target.status, version: target.version };
  }

  private createSession(user: InMemoryUserAccount, learning?: { studentId: string; guardianId: string; accessVersion: number; lifetimeMs: number }) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + (learning?.lifetimeMs ?? 12 * 3600_000)).toISOString();
    this.store.sessions.push({ id: this.store.nextId('session'), tokenHash: hashToken(token), userId: user.id,
      createdAt: new Date().toISOString(), expiresAt, revokedAt: null,
      ...(learning ? { studentId: learning.studentId, guardianId: learning.guardianId, accessVersion: learning.accessVersion } : {}) });
    this.eventBus.publish('auth.logged_in', { userId: user.id, role: user.role });
    return { token, expiresAt, user: { id: user.id, role: user.role, displayName: user.displayName,
      principal: user.role === 'student' ? '' : user.principal, ...(learning ? { studentId: learning.studentId } : {}) } };
  }
}
