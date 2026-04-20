import { BadRequestException, Injectable } from '@nestjs/common';
import { hash, compare } from 'bcryptjs';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';

type LoginCommand = {
  principal: string;
  credential: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly store: InMemoryStoreService,
    private readonly eventBus: DomainEventBusService,
  ) {}

  async login(command: LoginCommand) {
    const principal = command.principal.trim().toLowerCase();
    const credential = command.credential.trim();

    if (!principal || !credential) {
      throw new BadRequestException('principal and credential are required');
    }

    let user = this.store.users.find((item) => item.principal === principal);
    if (!user) {
      user = {
        id: this.store.nextId('user'),
        principal,
        passwordHash: await hash(credential, 10),
        role: principal.includes('admin') ? 'admin' : 'parent',
        displayName: principal.split('@')[0],
        status: 'active',
      };
      this.store.users.push(user);
    } else {
      const isValid = await compare(credential, user.passwordHash);
      if (!isValid) {
        throw new BadRequestException('invalid credential');
      }
    }

    const session = {
      id: this.store.nextId('session'),
      token: this.store.nextId('token'),
      userId: user.id,
      createdAt: new Date().toISOString(),
    };
    this.store.sessions.push(session);

    this.eventBus.publish('auth.logged_in', {
      userId: user.id,
      role: user.role,
    });

    return {
      token: session.token,
      user: {
        id: user.id,
        role: user.role,
        displayName: user.displayName,
        principal: user.principal,
      },
    };
  }
}

