import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadApiEnv } from '@study-agent/config';
import { trustedProxies } from './infrastructure/trusted-proxy';

async function bootstrap() {
  const env = loadApiEnv();
  const port = env.API_PORT ?? env.PORT;
  const proxy = trustedProxies(process.env.STUDY_TRUST_PROXY);
  const app = await NestFactory.create(AppModule, {
    cors: { origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000').split(','), credentials: true },
  });
  app.getHttpAdapter().getInstance().set('trust proxy', proxy);

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  await app.listen(port);
}

void bootstrap();
