import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { RequestWithContext } from './request-context.middleware';
import { InMemoryStoreService, InMemoryUserAccount, InMemoryAuthSession } from '../infrastructure/in-memory-store.service';
import { hashToken } from '../modules/auth/auth.service';

export function requestToken(request: { headers: { authorization?: string; cookie?: string } }) {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7).trim();
  const raw = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('study_session='));
  return raw ? raw.slice('study_session='.length) : '';
}

export type AuthenticatedRequest = RequestWithContext & {
  user: InMemoryUserAccount;
  authSession: InMemoryAuthSession;
};

// Student sessions deny new management routes by default. Resource-level checks
// still verify the child, session, response and plan on every allowed route.
const learningRoutes: Record<string, RegExp[]> = {
  GET: [/^auth\/me$/, /^learning\/students$/, /^learning\/students\/[^/]+\/(today|mistakes)$/,
    /^students\/[^/]+\/(profile|learning-scope|progress-proposals)$/, /^diagnostics\/curriculum$/, /^diagnostics\/textbooks(\/[^/]+)?$/,
    /^diagnostics\/sessions$/, /^diagnostics\/sessions\/[^/]+(\/(report|report-history)|\/items\/[^/]+)?$/,
    /^diagnostics\/students\/[^/]+\/(profile|plans|reviews)$/,
    /^diagnostics\/plans\/[^/]+(\/(reviews|retrospective))?$/,
    /^learning\/practice\/[^/]+(\/questions\/[^/]+)?$/, /^learning\/feedback$/,
    /^ai\/assistant\/sessions\/[^/]+\/messages$/],
  POST: [/^auth\/logout$/, /^students\/[^/]+\/progress-proposals$/, /^diagnostics\/sessions$/,
    /^diagnostics\/sessions\/[^/]+\/(responses|complete)$/, /^diagnostics\/sessions\/[^/]+\/items\/[^/]+\/hint$/,
    /^diagnostics\/reviews\/[^/]+\/start$/, /^learning\/plans\/[^/]+\/actions\/[^/]+\/start$/,
    /^learning\/practice\/[^/]+\/(responses|complete)$/, /^learning\/practice\/[^/]+\/questions\/[^/]+\/hint$/,
    /^learning\/feedback$/, /^ai\/assistant\/sessions(\/[^/]+\/messages)?$/],
  PATCH: [/^diagnostics\/sessions\/[^/]+\/items\/[^/]+\/draft$/, /^learning\/practice\/[^/]+\/questions\/[^/]+\/draft$/],
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly store: InMemoryStoreService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = requestToken(request);
    const session = token ? this.store.sessions.find((item) => item.tokenHash === hashToken(token)) : undefined;
    if (!session || session.revokedAt || Date.parse(session.expiresAt) <= Date.now()) {
      throw new UnauthorizedException('Invalid session token');
    }

    const user = this.store.users.find((item) => item.id === session.userId);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('User is unavailable');
    }

    if (user.role === 'student') {
      const access = this.store.studentLearningAccess.find(a => a.studentId === session.studentId && a.userId === user.id && a.status === 'enabled' && a.version === session.accessVersion);
      const guardian = this.store.users.find(u => u.id === session.guardianId && u.status === 'active' && ['parent', 'admin'].includes(u.role));
      const bound = guardian && (guardian.role === 'admin' || this.store.bindings.some(b => b.parentUserId === guardian.id && b.studentId === session.studentId && b.status === 'active'));
      if (!access || !bound) throw new UnauthorizedException('学习权限已变更，请由家长重新开启');
      const path = request.path.replace(/^\/api\//, '').replace(/\/$/, '');
      if (!learningRoutes[request.method]?.some(pattern => pattern.test(path))) throw new ForbiddenException('这是孩子的学习身份，请由家长登录后管理');
    }

    request.user = user;
    request.authSession = session;
    return true;
  }
}
