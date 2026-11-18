import { configureHttpBoundary } from './http-boundary.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
export async function createApplication() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: false,
    bodyParser: false,
    logger: false,
  });
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  configureHttpBoundary(app);
  app.enableShutdownHooks();
  return app;
}
