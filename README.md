# API Archaeologist

API Archaeologist is an early-stage project for explaining potential API consumer impact using traceable evidence. Missing usage information must never be treated as proof that an API change is safe.

Current implementation: repository tooling and synthetic fixtures only. There is no application server, UI, database migration or published release yet. NestJS with TypeScript has been selected for the backend; implementation has not started.

## Contributor setup

Use Node **24.21.0** and npm **11.19.0**.

```sh
npm ci --ignore-scripts
npm run check
```

`npm run format` formats repository files. `npm run docs:check` checks public local links and JSON syntax and rejects internal planning paths if tracked. `npm test` tests that tooling. These commands work on a public clone without team-only documents. Application build, database and end-to-end tests will be introduced with the corresponding implementation.

Internal research, architecture, roadmap and implementation tickets are maintained outside this Git checkout. They are not included in the public repository or hosted CI. Ask the maintainer for authorized team access; do not upload copies to issues, pull requests or CI artifacts.

## Participation

- [Contributing](CONTRIBUTING.md)
- [Security reporting](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Support](SUPPORT.md)
- [Synthetic fixture notes](fixtures/README.md)
- [Changelog](CHANGELOG.md)

The existing [Apache-2.0 LICENSE](LICENSE) is unchanged. Owner confirmation of the final licensing policy remains pending. No repository protection, hosted service, production readiness or support SLA is claimed.
