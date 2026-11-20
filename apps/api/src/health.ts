import { z } from 'zod';
import { OwnedResponse } from './http-boundary.js';
import { createHash } from 'node:crypto';
import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createPool, loadMigrations } from '@heimdall/adapters';
import type { OnApplicationShutdown } from '@nestjs/common';
import type { Configuration } from './configuration.js';
const healthContract = {
  request: z.never(),
  response: z.strictObject({ status: z.literal('ok') }),
};
export const DATABASE = Symbol('DATABASE');
export class DatabaseLifecycle implements OnApplicationShutdown {
  readonly pool: ReturnType<typeof createPool>;
  readonly expected: Promise<{ version: number; checksum: string }[]>;
  constructor(config: Configuration) {
    this.pool = createPool(config.databaseUrl, {
      statementMs: config.statementMs,
      connectMs: config.connectMs,
    });
    this.expected = this.loadExpected();
  }
  private lastState: string | undefined;
  private state(code: string) {
    if (this.lastState !== code) {
      this.lastState = code;
      console.info(JSON.stringify({ event: 'READINESS_CHANGED', code }));
    }
    return code === 'READY';
  }
  private async loadExpected() {
    const migrations = await loadMigrations();
    if (!migrations.length || migrations.some((m, i) => m.version !== i + 1))
      throw new Error('INVALID_MIGRATION_MANIFEST');
    return migrations.map((m) => ({
      version: m.version,
      checksum: createHash('sha256').update(m.sql).digest('hex'),
    }));
  }
  async ready() {
    try {
      const expected = await this.expected;
      const result = await this.pool.query<{
        version: number;
        checksum: string;
      }>('SELECT version,checksum FROM app.schema_migrations ORDER BY version');
      const compatible =
        result.rows.length === expected.length &&
        result.rows.every(
          (row, i) =>
            row.version === expected[i]?.version &&
            row.checksum === expected[i]?.checksum,
        );
      return this.state(compatible ? 'READY' : 'SCHEMA_INCOMPATIBLE');
    } catch {
      return this.state('DB_UNAVAILABLE');
    }
  }
  async onApplicationShutdown() {
    await this.pool.end();
  }
}
@Controller('health')
export class HealthController {
  constructor(@Inject(DATABASE) private readonly database: DatabaseLifecycle) {}
  @Get('live') @OwnedResponse(healthContract) live() {
    return { status: 'ok' };
  }
  @Get('ready') @OwnedResponse(healthContract) async ready() {
    if (!(await this.database.ready())) throw new ServiceUnavailableException();
    return { status: 'ok' };
  }
}
