import { DomainError } from '@heimdall/domain';
export type FailureCode = 'INVALID_INPUT' | 'CONFLICT' | 'INTERNAL';
/** Classifies failures without exposing arbitrary exception messages. */
export function classifyFailure(error: unknown): FailureCode {
  return error instanceof DomainError ? error.code : 'INTERNAL';
}
