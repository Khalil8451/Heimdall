export interface Configuration {
  host: string;
  port: number;
  databaseUrl: string;
  statementMs: number;
  connectMs: number;
  shutdownMs: number;
}
export function configuration(env: NodeJS.ProcessEnv): Readonly<Configuration> {
  const host = env.HOST ?? '127.0.0.1';
  if (
    !['127.0.0.1', '::1'].includes(host) ||
    (env.AUTH_MODE ?? 'local') !== 'local'
  )
    throw new Error('UNSUPPORTED_EXPOSURE_MODE');
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const value = env[key] ?? String(fallback);
    if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max)
      throw new Error('INVALID_CONFIGURATION');
    return Number(value);
  };
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL ?? '');
  } catch {
    throw new Error('DATABASE_CONFIGURATION_REQUIRED');
  }
  if (
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    url.username !== 'heimdall_runtime' ||
    !url.password ||
    !url.pathname.slice(1) ||
    url.search ||
    url.hash
  )
    throw new Error('INVALID_DATABASE_CONFIGURATION');
  return Object.freeze({
    host,
    port: integer('PORT', 3000, 0, 65535),
    databaseUrl: url.href,
    statementMs: integer('DB_STATEMENT_MS', 2000, 50, 10000),
    connectMs: integer('DB_CONNECT_MS', 1000, 50, 10000),
    shutdownMs: integer('SHUTDOWN_MS', 5000, 100, 30000),
  });
}
