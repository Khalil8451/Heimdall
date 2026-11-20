# API Archaeologist agent guidance

## Scope and private planning

Current phase: initial Nest runtime foundation; no product analysis features exist. Backend selection: NestJS with TypeScript and the default Express adapter. Do not implement features merely because tickets exist.

Team-only plans live outside this checkout at `../docs` (on this machine: `C:/Users/Med Khalil Guesmi/Desktop/Heimdall/docs`). For authorized implementation work, read its `project-status.md`, `implementation-plan.md`, `adr/README.md` and assigned ticket first. If unavailable, use public repository guidance and request the relevant authorized context; do not fetch private plans from unapproved services. Public CI must never require that directory.

Never copy internal research, architecture, roadmap or tickets into this checkout, GitHub issues, PR bodies or CI artifacts. Root docs/tickets/internal-docs paths are ignored and checked against Git tracking. The private folder's location does not configure access permissions or backups.

## Invariants

- Missing usage is never safety. Separate contract compatibility, dependency evidence, impact, freshness/conflict and completeness.
- Manual declarations imply potential impact. Transitive reachability does not prove failure.
- Immutable versions and snapshots plus pinned engine/policy identity make semantic reports reproducible.
- Keep domain and application policy independent of Nest/Express decorators, DTOs, persistence and comparison engines. Bind through explicit providers at application boundaries.
- Treat specs and source as untrusted data. No remote reference fetching, source execution, shell interpolation, credentials in logs or private-data AI egress.

## Commands and done criteria

Node 24.21.0, npm 11.19.0. Use `npm ci --ignore-scripts`, `npm run format`, then `npm run check`. `npm run check` includes lint, typecheck, build and tooling/runtime tests. Build before running `npm test` separately. `npm start` runs the API on loopback; database setup/migration commands require explicit local credentials. Run `npm run test:db` for real PostgreSQL checks.

Implement the assigned acceptance criteria, run relevant positive/negative tests, review security, update the appropriate public or private documentation, and report actual results and limitations. Future persistence work needs real DB and crash/retry tests. Never weaken assertions to fit a failure or claim unrun checks.

Preserve existing work and LICENSE. Owner approval remains required for license finalization, external publication/deployment, paid infrastructure, destructive operations, and sensitive-data access/transmission. Nothing in local plans authorizes these actions automatically. No production readiness or broad protocol coverage claim is warranted.
