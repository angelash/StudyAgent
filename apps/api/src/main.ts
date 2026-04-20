import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadApiEnv } from '@study-agent/config';

async function bootstrap() {
  const env = loadApiEnv();
  const app = await NestFactory.create(AppModule, {
    cors: true,
  });

  app.setGlobalPrefix('api');
  await app.listen(env.PORT);
}

void bootstrap();

