# PostgreSQL adapter

Requires the pinned PostgreSQL 18.7 image and a working Docker engine. This is local infrastructure; no product tables are created.

Copy the root .env.example to the ignored .env file and generate three independent passwords of at least 20 characters. Configure ADMIN_DATABASE_URL for postgres, MIGRATION_DATABASE_URL for heimdall_migrator, and DATABASE_URL for heimdall_runtime, using database heimdall at 127.0.0.1:5432. URL-encode password characters. Never log these URLs or commit .env.

Run from the repository root:

```sh
npm run build
docker compose up -d --wait
npm run db:setup
npm run db:migrate
```

Setup requires administrator credentials, configures only the named Heimdall roles/schema, and is intended for this dedicated local database. Password values are bound parameters; PostgreSQL's format(%L) quotes the required ALTER ROLE literals. No client-side password concatenation is used. Setup is a separate command, never an API startup action. Do not run it against a shared or production cluster without a reviewed provisioning procedure.

The migrator owns the app schema. The runtime role receives data privileges on future tables and read-only access to migration metadata; it cannot alter schema, modify migration history or read pg_authid secrets. All runtime data statements must use parameters. Transactions always commit or roll back, releasing or discarding the connection after failure.

Migrations are ordered files with contiguous numeric prefixes. The runner canonicalizes CRLF to LF, hashes the SQL, verifies every applied version/checksum, and serializes runners with a transaction-scoped advisory lock. A failed batch rolls back both SQL and history. Never edit applied SQL: append a reviewed migration. Missing or changed history fails closed. There is no automatic downgrade or reset command.

Pools default to five connections, a one-second acquisition timeout, two-second server statement timeout, three-second query timeout, and five-second idle transaction timeout. poolMetrics exposes total, idle and waiting counts; successful migration CLI output contains version and elapsed milliseconds. Failures omit connection strings and SQL text.

npm run test:db creates a unique container with random synthetic credentials, exercises real PostgreSQL, and a uniquely named test volume, verifies restart persistence, then removes only those test resources. It does not use the development named volume. CI runs this on Linux. The Compose named volume survives docker compose down; restarting with existing storage does not automatically rotate administrator credentials. Back up valuable data before any manual volume operation. No backup/restore capability is claimed.
