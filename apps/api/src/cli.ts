import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { hash } from 'bcryptjs';
import { AppModule } from './app.module';
import { InMemoryStoreService } from './infrastructure/in-memory-store.service';
import { credentialsSchema } from './common/validation';

async function main() {
  if (process.argv[2] !== 'create-admin') throw new Error('Usage: create-admin <principal>; supply STUDY_ADMIN_PASSWORD through environment');
  const command = credentialsSchema.parse({ principal: process.argv[3], credential: process.env.STUDY_ADMIN_PASSWORD });
  delete process.env.STUDY_ADMIN_PASSWORD;
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const store = app.get(InMemoryStoreService);
    if (!store.persistence.durable) throw new Error('Administrator bootstrap requires durable storage');
    await store.transaction(async () => {
      if (store.users.some((item) => item.principal === command.principal)) throw new Error('Account already exists; existing roles are never silently elevated');
      const id = store.nextId('user');
      store.users.push({ id, principal: command.principal, passwordHash: await hash(command.credential, 12),
        displayName: command.principal.split('@')[0], role: 'admin', status: 'active' });
      store.events.push({ eventId: store.nextId('audit'), eventName: 'admin.bootstrapped', eventVersion: 1,
        occurredAt: new Date().toISOString(), payload: { userId: id, channel: 'local-cli' } });
    });
    process.stdout.write('Administrator created. Sign in through the application.\n');
  } finally { await app.close(); }
}

void main().catch(() => { process.stderr.write('Administrator bootstrap failed. Check arguments, storage and account uniqueness. No credential is logged.\n'); process.exitCode = 1; });
