# API Archaeologist

API Archaeologist is an early-stage project for explaining potential API consumer impact using traceable evidence. Missing usage information must never be treated as proof that an API change is safe.

Current implementation: a minimal NestJS/Express server, framework-free error classification, repository tooling and synthetic fixtures. PostgreSQL infrastructure and checksum-tracked migrations are available. There are no analysis endpoints, UI or published releases.

## Contributor setup

Use Node **24.21.0** and npm **11.19.0**.

```sh
npm ci --ignore-scripts
npm run check
```

`npm run format` formats repository files. `npm run docs:check` checks public local links and JSON syntax and rejects internal planning paths if tracked. `npm run check` also runs lint, strict TypeScript checks, production builds, and runtime/boundary tests. These commands work on a public clone without team-only documents. `npm run test:db` separately runs real PostgreSQL integration tests using Docker; hosted CI includes that job. Product end-to-end tests will be introduced with analysis features.

Run `npm run build`, then `npm start` to listen on `127.0.0.1:3000`. No product routes exist yet; unknown paths return 404. Stop with Ctrl+C. Startup errors exit unsuccessfully without printing exception contents. Run `npm test` after building. Workspace builds run domain → application → API; only the API enables decorator metadata.

Internal research, architecture, roadmap and implementation tickets are maintained outside this Git checkout. They are not included in the public repository or hosted CI. Ask the maintainer for authorized team access; do not upload copies to issues, pull requests or CI artifacts.

See [API runtime conventions](apps/api/README.md) for owned schemas, error codes, limits and safe telemetry.
See [PostgreSQL setup](packages/adapters/README.md) for local credentials, migration commands and real database tests.

## Participation

- [Contributing](CONTRIBUTING.md)
- [Security reporting](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Support](SUPPORT.md)
- [Synthetic fixture notes](fixtures/README.md)
- [Changelog](CHANGELOG.md)

The existing [Apache-2.0 LICENSE](LICENSE) is unchanged. Owner confirmation of the final licensing policy remains pending. No repository protection, hosted service, production readiness or support SLA is claimed.
