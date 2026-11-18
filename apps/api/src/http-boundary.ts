import { randomUUID } from 'node:crypto';
import {
  Body,
  Catch,
  HttpException,
  UseInterceptors,
  applyDecorators,
  HttpCode,
} from '@nestjs/common';
import type {
  ArgumentsHost,
  CallHandler,
  ExceptionFilter,
  NestInterceptor,
  PipeTransform,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
import { classifyFailure } from '@heimdall/application';
import { map } from 'rxjs';
import { z } from 'zod';

export const problemSchema = z.strictObject({
  type: z.literal('about:blank'),
  status: z.number().int().min(400).max(599),
  code: z.enum([
    'BAD_REQUEST',
    'NOT_FOUND',
    'CONFLICT',
    'PAYLOAD_TOO_LARGE',
    'INVALID_INPUT',
    'RATE_LIMITED',
    'UNAVAILABLE',
    'INTERNAL',
  ]),
  title: z.string().max(64),
  requestId: z.uuid(),
  diagnostics: z
    .array(
      z.strictObject({
        path: z.string().max(128),
        code: z.literal('INVALID_FIELD'),
      }),
    )
    .max(10)
    .optional(),
});
const requestIds = new WeakMap<Request, string>();
const problems = {
  400: ['BAD_REQUEST', 'Invalid request'],
  404: ['NOT_FOUND', 'Resource not found'],
  409: ['CONFLICT', 'Conflicting state'],
  413: ['PAYLOAD_TOO_LARGE', 'Request too large'],
  422: ['INVALID_INPUT', 'Invalid input'],
  429: ['RATE_LIMITED', 'Request limit exceeded'],
  503: ['UNAVAILABLE', 'Service unavailable'],
  500: ['INTERNAL', 'Internal server error'],
} as const;
class InvalidEnvelope extends HttpException {
  constructor(readonly diagnostics: { path: string; code: 'INVALID_FIELD' }[]) {
    super('Invalid request', 400);
  }
}
export interface OwnedContract {
  readonly request: z.ZodType;
  readonly response: z.ZodType;
}
/** Only developer-authored schemas belong here. Never convert uploaded specifications to validators. */
export class OwnedBodyPipe implements PipeTransform {
  constructor(private readonly schema: z.ZodType) {}
  transform(value: unknown): unknown {
    const parsed = this.schema.safeParse(value);
    if (parsed.success) return parsed.data;
    throw new InvalidEnvelope(
      parsed.error.issues.slice(0, 10).map((issue) => ({
        path: issue.path
          .map((part) => String(part))
          .join('.')
          .replace(/[^a-zA-Z0-9_.]/g, '_')
          .slice(0, 128),
        code: 'INVALID_FIELD',
      })),
    );
  }
}
class ResponseConformance implements NestInterceptor {
  constructor(private readonly schema: z.ZodType) {}
  intercept(_context: unknown, next: CallHandler) {
    return next.handle().pipe(
      map((value: unknown) => {
        const parsed = this.schema.safeParse(value);
        if (!parsed.success) throw new Error('RESPONSE_CONFORMANCE');
        return parsed.data;
      }),
    );
  }
}
export const OwnedBody = (contract: OwnedContract) =>
  Body(new OwnedBodyPipe(contract.request));
export const OwnedResponse = (contract: OwnedContract) =>
  applyDecorators(
    HttpCode(200),
    UseInterceptors(new ResponseConformance(contract.response)),
  );
export function ownedOperation(contract: OwnedContract) {
  return {
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: z.toJSONSchema(contract.request, {
            target: 'openapi-3.0',
            io: 'input',
          }),
        },
      },
    },
    responses: {
      '200': {
        description: 'Success',
        content: {
          'application/json': {
            schema: z.toJSONSchema(contract.response, {
              target: 'openapi-3.0',
            }),
          },
        },
      },
    },
  };
}
export type RequestLog = (event: {
  requestId: string;
  status: number;
  durationMs: number;
}) => void;
export type FailureLog = (event: {
  code: 'INTERNAL';
  requestId: string;
}) => void;
@Catch()
export class ProblemFilter implements ExceptionFilter {
  constructor(private readonly log: FailureLog) {}
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const requestId =
      requestIds.get(host.switchToHttp().getRequest<Request>()) ?? randomUUID();
    response.setHeader('x-request-id', requestId);
    const failure = classifyFailure(error);
    let status: number =
      failure === 'CONFLICT' ? 409 : failure === 'INVALID_INPUT' ? 422 : 500;
    if (error instanceof HttpException) status = error.getStatus();
    else if (error instanceof Error && 'type' in error) {
      if (error.type === 'entity.parse.failed') status = 400;
      if (error.type === 'entity.too.large') status = 413;
    }
    if (!(status in problems)) status = 500;
    const [code, title] = problems[status as keyof typeof problems];
    if (status === 500) this.log({ code: 'INTERNAL', requestId });
    const problem = problemSchema.parse({
      type: 'about:blank',
      status,
      code,
      title,
      requestId,
      ...(error instanceof InvalidEnvelope
        ? { diagnostics: error.diagnostics }
        : {}),
    });
    response.status(status).type('application/problem+json').json(problem);
  }
}
export function configureHttpBoundary(
  app: NestExpressApplication,
  log: FailureLog = (event) => console.error(JSON.stringify(event)),
  onRequest?: RequestLog,
) {
  app.use((request: Request, response: Response, next: NextFunction) => {
    const candidate = request.headers['x-request-id'];
    const requestId =
      typeof candidate === 'string' && z.uuid().safeParse(candidate).success
        ? candidate
        : randomUUID();
    const started = performance.now();
    response.once('finish', () =>
      onRequest?.({
        requestId,
        status: response.statusCode,
        durationMs: performance.now() - started,
      }),
    );
    requestIds.set(request, requestId);
    response.setHeader('x-request-id', requestId);
    next();
  });
  app.useBodyParser('json', { limit: 16384, strict: true });
  app.useGlobalFilters(new ProblemFilter(log));
}
