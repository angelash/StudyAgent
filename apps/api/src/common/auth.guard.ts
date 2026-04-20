import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { RequestWithContext } from './request-context.middleware';
import { InMemoryStoreService, InMemoryUserAccount } from '../infrastructure/in-memory-store.service';

export type AuthenticatedRequest = RequestWithContext & {
  user: InMemoryUserAccount;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly store: InMemoryStoreService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authorization.slice('Bearer '.length).trim();
    const session = this.store.sessions.find((item) => item.token === token);
    if (!session) {
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

