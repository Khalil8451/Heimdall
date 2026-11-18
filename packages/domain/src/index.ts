export type DomainErrorCode = 'INVALID_INPUT' | 'CONFLICT';
/** Stable domain failure identity; transport chooses presentation. */
export class DomainError extends Error {
  constructor(readonly code: DomainErrorCode) {
    super(code);
    this.name = 'DomainError';
  }
}
