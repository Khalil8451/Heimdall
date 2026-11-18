# Contributing

The repository currently contains tooling and synthetic fixtures. Coordinate a scoped task with the maintainer before implementing application features. Internal planning is shared separately with authorized team members and is not required to run public checks.

## Local workflow

Use Node 24.21.0 and npm 11.19.0. Run `npm ci --ignore-scripts`, make a coherent change, run `npm run format`, then `npm run check`. The lockfile is authoritative; lifecycle scripts remain disabled unless a reviewed dependency requires them. No app startup/build/database command exists yet.

Use short-lived branches and Conventional Commit PR titles. Describe the public-facing behavior, verification actually run, errors handled and known limitations. Do not include private ticket text, architecture documents, credentials or private artifacts in a public PR. Request internal review separately when needed.

Keep domain policy independent of HTTP/framework/persistence concerns. Future NestJS controllers should be thin and inputs explicitly validated. Tests must cover the relevant negative cases; do not mock away database transactions or weaken expectations just to pass. Update public documentation only with information approved for publication.

Only synthetic or authorized public fixtures belong here. Internal documentation copies under root docs/tickets/internal-docs are ignored and rejected by the tracked-path check; never force-add them. A clean public clone must pass without private files.

Follow [SECURITY.md](SECURITY.md) for vulnerabilities and the [code of conduct](CODE_OF_CONDUCT.md). The existing license is unchanged; owner confirmation of final licensing policy remains pending. No contributor rights-transfer mechanism is introduced.
