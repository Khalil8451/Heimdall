import { configuration } from './configuration.js';
import { DATABASE, DatabaseLifecycle } from './health.js';
import { configureHttpBoundary } from './http-boundary.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
export async function createApplication(env: NodeJS.ProcessEnv = process.env) {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register(configuration(env)),
    {
      abortOnError: false,
      bodyParser: false,
      logger: false,
    },
  );
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  configureHttpBoundary(app);
  try {
    await app.get<DatabaseLifecycle>(DATABASE).expected;
  } catch (error) {
    await app.close();
    throw error;
  }
  return app;
}
