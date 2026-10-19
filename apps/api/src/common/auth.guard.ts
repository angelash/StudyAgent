import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { RequestWithContext } from './request-context.middleware';
import { InMemoryStoreService, InMemoryUserAccount } from '../infrastructure/in-memory-store.service';
import { hashToken } from '../modules/auth/auth.service';

export function requestToken(request: { headers: { authorization?: string; cookie?: string } }) {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7).trim();
  const raw = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('study_session='));
  return raw ? raw.slice('study_session='.length) : '';
}

export type AuthenticatedRequest = RequestWithContext & {
  user: InMemoryUserAccount;
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

    request.user = user;
    return true;
  }
}
