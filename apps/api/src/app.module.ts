import { classifyFailure } from '@heimdall/application';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { Configuration } from './configuration.js';
import { DATABASE, DatabaseLifecycle, HealthController } from './health.js';
export const FAILURE_CLASSIFIER = Symbol('FAILURE_CLASSIFIER');
export const LISTEN_OPTIONS = Symbol('LISTEN_OPTIONS');
@Module({})
export class AppModule {
  static register(config: Configuration): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      providers: [
        { provide: FAILURE_CLASSIFIER, useFactory: () => classifyFailure },
        {
          provide: LISTEN_OPTIONS,
          useValue: Object.freeze({ host: config.host, port: config.port }),
        },
        { provide: DATABASE, useFactory: () => new DatabaseLifecycle(config) },
      ],
    };
  }
}
