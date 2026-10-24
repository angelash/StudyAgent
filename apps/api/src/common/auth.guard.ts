import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { RequestWithContext } from './request-context.middleware';
import { InMemoryStoreService, InMemoryUserAccount, InMemoryAuthSession } from '../infrastructure/in-memory-store.service';
import { hashToken } from '../modules/auth/auth.service';
import { RateLimitService } from '../infrastructure/rate-limit.service';

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
  GET: [/^auth\/me$/, /^learning\/home$/, /^learning\/students$/, /^learning\/students\/[^/]+\/(today|mistakes)$/,
    /^learning\/classroom\/sessions\/[^/]+$/,
    /^learning\/classroom\/sessions\/[^/]+\/visuals(\/[^/]+\/file)?$/,
    /^learning\/projects\/(catalog|[^/]+)$/,
    /^learning\/source-courses(\/(materials|[^/]+))?$/,
    /^learning\/studio\/overview$/, /^learning\/studio\/materials\/[^/]+\/(pages\/\d+|original)$/,
    /^learning\/studio\/calendar\/export$/,
    /^gesp\/students\/[^/]+\/workspace$/,
    /^learning\/students\/[^/]+\/notebook(\/[^/]+\/[^/]+)?$/,
    /^students\/[^/]+\/(profile|learning-scope|progress-proposals)$/, /^diagnostics\/curriculum$/, /^diagnostics\/textbooks(\/[^/]+)?$/,
    /^diagnostics\/sessions$/, /^diagnostics\/sessions\/[^/]+(\/(report|report-history|analysis-status)|\/items\/[^/]+)?$/,
    /^diagnostics\/blueprints\/[^/]+$/,
    /^diagnostics\/students\/[^/]+\/(profile|plans|reviews)$/,
    /^diagnostics\/students\/[^/]+\/evidence\/[^/]+$/,
    /^diagnostics\/plans\/[^/]+(\/(reviews|retrospective))?$/,
    /^learning\/practice\/[^/]+(\/questions\/[^/]+)?$/, /^learning\/feedback$/,
    /^ai\/models$/, /^ai\/assistant\/sessions\/[^/]+\/messages$/, /^learning\/media\/(capabilities|[^/]+(\/content)?)$/,
    /^measurement-content\/candidates\/[^/]+\/media\/\d+$/],
  POST: [/^auth\/logout$/, /^students\/[^/]+\/progress-proposals$/, /^diagnostics\/sessions$/,
    /^learning\/classroom\/sessions(\/[^/]+\/(answers|hints|messages|presentation|narration\/[^/]+))?$/,
    /^learning\/classroom\/sessions\/[^/]+\/visuals(\/[^/]+\/(select|unselect|cancel|retry|delete))?$/,
    /^learning\/projects(\/[^/]+\/(submissions|legacy|advice))?$/,
    /^learning\/source-courses(\/materials\/text|\/[^/]+\/(confirm|cancel|retry|archive))?$/,
    /^learning\/studio\/courses(\/preview)?$/, /^learning\/studio\/courses\/[^/]+\/lessons\/[^/]+\/start$/,
    /^learning\/studio\/whiteboards(\/preview)?$/, /^learning\/studio\/whiteboards\/[^/]+\/narration\/[^/]+$/,
    /^learning\/studio\/materials\/pdf$/, /^learning\/studio\/materials\/[^/]+\/whiteboard(\/preview)?$/,
    /^learning\/studio\/materials\/[^/]+\/structure\/review$/,
    /^learning\/studio\/materials\/[^/]+\/process\/retry$/,
    /^learning\/studio\/study-packs(\/preview)?$/,
    /^learning\/studio\/study-plans\/preview$/, /^learning\/studio\/study-plans\/[^/]+\/sessions\/[^/]+$/,
    /^learning\/students\/[^/]+\/notebook\/[^/]+\/[^/]+\/(organize|redo|verification)$/,
    /^diagnostics\/blueprints(\/[^/]+\/start)?$/,
    /^diagnostics\/sessions\/[^/]+\/state$/,
    /^diagnostics\/sessions\/[^/]+\/(responses|complete)$/, /^diagnostics\/sessions\/[^/]+\/items\/[^/]+\/hint$/,
    /^diagnostics\/reviews\/[^/]+\/start$/, /^learning\/plans\/[^/]+\/actions\/[^/]+\/start$/,
    /^learning\/practice\/[^/]+\/(responses|complete)$/, /^learning\/practice\/[^/]+\/questions\/[^/]+\/hint$/,
    /^learning\/feedback$/, /^ai\/assistant\/sessions(\/[^/]+\/messages)?$/, /^learning\/media(\/[^/]+\/(complete|cancel))?$/, /^gesp\/(code|probe)-submissions$/, /^gesp\/hints$/],
  PUT: [/^learning\/media\/[^/]+\/chunks\/\d+$/],
  PATCH: [/^learning\/source-courses\/[^/]+$/, /^learning\/projects\/[^/]+$/, /^learning\/classroom\/sessions\/[^/]+$/, /^diagnostics\/sessions\/[^/]+\/items\/[^/]+\/draft$/, /^learning\/practice\/[^/]+\/questions\/[^/]+\/draft$/],
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly store: InMemoryStoreService, private readonly limits: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = requestToken(request);
    const session = token ? this.store.find('sessions', { tokenHash: hashToken(token) }) : undefined;
    if (!session || session.revokedAt || Date.parse(session.expiresAt) <= Date.now()) {
      throw new UnauthorizedException('Invalid session token');
    }

    const user = this.store.find('users', { id: session.userId });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('User is unavailable');
    }

    if (user.role === 'student') {
      const access = this.store.find('studentLearningAccess', { studentId: session.studentId, userId: user.id, status: 'enabled', version: session.accessVersion });
      const guardian = this.store.find('users', { id: session.guardianId, status: 'active', role: ['parent', 'admin'] });
      const bound = guardian && (guardian.role === 'admin' || Boolean(this.store.find('bindings', { parentUserId: guardian.id, studentId: session.studentId, status: 'active' })));
      if (!access || !bound) throw new UnauthorizedException('学习权限已变更，请由家长重新开启');
      const path = request.path.replace(/^\/api\//, '').replace(/\/$/, '');
      if (!learningRoutes[request.method]?.some(pattern => pattern.test(path))) throw new ForbiddenException('这是孩子的学习身份，请由家长登录后管理');
    }

    const writing = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    await this.limits.assert(`request-user:${writing ? 'write' : 'read'}:${user.id}`, writing ? 180 : 600, 60000);
    if (writing && (request.path.startsWith('/api/ai/') || /^\/api\/learning\/classroom\/sessions\/[^/]+\/messages$/.test(request.path) || /^\/api\/learning\/projects\/[^/]+\/advice$/.test(request.path)))
      await this.limits.assert(`request-ai:${user.id}`, 60, 600000);
    request.user = user;
    request.authSession = session;
    return true;
  }
}
