import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ENV_TOKEN } from './config/config.module';
import type { Env } from './config/env.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  const env = app.get<Env>(ENV_TOKEN);

  app.use(helmet());
  app.enableCors({ origin: env.CORS_ORIGIN, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.setGlobalPrefix('api/v1');

  await app.listen(env.PORT, '0.0.0.0');
  new Logger('Bootstrap').log(`SteadyState API listening on :${env.PORT} (${env.NODE_ENV})`);
}

void bootstrap();
