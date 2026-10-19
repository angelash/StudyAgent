import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
// An explicit worker process consumes the same transactional outbox as the API.
process.env.STUDY_WORKER_ENABLED = 'true';
async function main() {
  if (process.env.STUDY_STORAGE === 'memory') throw new Error('Workers require durable storage');
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  // The worker interval is unref'ed for embedded API use; keep this standalone process alive.
  const keepAlive = setInterval(() => {}, 60_000);
  process.once('SIGTERM', () => clearInterval(keepAlive)); process.once('SIGINT', () => clearInterval(keepAlive));
}
void main();
