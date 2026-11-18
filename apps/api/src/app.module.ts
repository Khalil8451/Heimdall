import { classifyFailure } from '@heimdall/application';
import { Module } from '@nestjs/common';
export const FAILURE_CLASSIFIER = Symbol('FAILURE_CLASSIFIER');
export const LISTEN_OPTIONS = Symbol('LISTEN_OPTIONS');
@Module({
  providers: [
    { provide: FAILURE_CLASSIFIER, useFactory: () => classifyFailure },
    {
      provide: LISTEN_OPTIONS,
      useFactory: () => Object.freeze({ host: '127.0.0.1', port: 3000 }),
    },
  ],
})
export class AppModule {}
