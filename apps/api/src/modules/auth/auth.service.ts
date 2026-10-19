import { ConflictException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { hash, compare } from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { credentialsSchema, validate } from '../../common/validation';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  private readonly attempts = new Map<string, { count: number; expiresAt: number }>();
  constructor(
    private readonly store: InMemoryStoreService,
    private readonly eventBus: DomainEventBusService,
  ) {}

  private rateLimit(key: string) {
    const current = this.attempts.get(key);
    const state = current && current.expiresAt > Date.now() ? current : { count: 0, expiresAt: Date.now() + 15 * 60_000 };
    state.count++;
    this.attempts.set(key, state);
    if (this.attempts.size > 10_000) {
      for (const [entry, value] of this.attempts) if (value.expiresAt <= Date.now()) this.attempts.delete(entry);
    }
    if (state.count > 30) throw new HttpException('尝试次数过多，请稍后重试', 429);
  }

  async register(input: unknown, address = 'local') {
    const command = validate(credentialsSchema, input);
    this.rateLimit(`register:${address}`);
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
    this.rateLimit(key);
    this.rateLimit(`login-ip:${address}`);
    const user = this.store.users.find((item) => item.principal === command.principal);
    const valid = await compare(command.credential, user?.passwordHash ?? '$2b$12$pAxqI0sYiLqor2F0ILhL1.I9/lYcflo6QwYV6jkz41p0d4ESJ8rN2');
    if (!user || !valid || user.status !== 'active') throw new UnauthorizedException('账号或密码不正确');
    this.attempts.delete(key);
    return this.createSession(user);
  }

  logout(token: string) {
    const session = this.store.sessions.find((item) => item.tokenHash === hashToken(token));
    if (session) session.revokedAt = new Date().toISOString();
    return { loggedOut: true };
  }

  private createSession(user: InMemoryUserAccount) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 12 * 3600_000).toISOString();
    this.store.sessions.push({ id: this.store.nextId('session'), tokenHash: hashToken(token), userId: user.id,
      createdAt: new Date().toISOString(), expiresAt, revokedAt: null });
    this.eventBus.publish('auth.logged_in', { userId: user.id, role: user.role });
    return { token, expiresAt, user: { id: user.id, role: user.role, displayName: user.displayName, principal: user.principal } };
  }
}
