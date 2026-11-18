# API runtime conventions

The server currently has no product routes. It binds to loopback; run the root build before starting it.

HTTP JSON envelopes are capped at 16 KiB. Uploaded API documents will need a separate bounded ingestion path; they must never supply executable schema or validator code.

Developer-owned DTO schemas use Zod strict objects with explicit primitive types. Do not use coercion or transforms in HTTP contracts. Bind the same contract object with OwnedBody and OwnedResponse; ownedOperation derives the OpenAPI 3.0 schema from that object and throws for unsupported schema representations. OwnedResponse fixes the success status at 200 and verifies output before serialization. It does not supply an ingestion endpoint or a complete public API specification.

Failures use application/problem+json with type, status, code, title and requestId. Validation diagnostics contain at most 10 field paths (128 characters each), with static INVALID_FIELD codes. They omit raw values and exception messages. Contract violations and unexpected exceptions produce INTERNAL and one sanitized owning-boundary log.

| HTTP status | Stable code       | Meaning                                          |
| ----------- | ----------------- | ------------------------------------------------ |
| 400         | BAD_REQUEST       | Malformed JSON or invalid request DTO            |
| 404         | NOT_FOUND         | Missing route/resource                           |
| 409         | CONFLICT          | Domain conflict                                  |
| 413         | PAYLOAD_TOO_LARGE | JSON envelope exceeds the configured limit       |
| 422         | INVALID_INPUT     | Domain input invariant failed                    |
| 429         | RATE_LIMITED      | Request limit exceeded                           |
| 503         | UNAVAILABLE       | Service unavailable                              |
| 500         | INTERNAL          | Unexpected error or response conformance failure |

Inbound x-request-id is accepted only as a UUID; otherwise the boundary generates one. The response header, error envelope and logs share that identity. configureHttpBoundary provides an optional request telemetry callback containing only requestId, status and durationMs; body contents, URLs, headers and credentials are excluded. Log sinks must be nonthrowing. Authentication-specific codes and upload source diagnostics belong to their future boundaries.
