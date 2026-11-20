import { createApplication } from './bootstrap.js';
import { configuration } from './configuration.js';
import { termination } from './lifecycle.js';
try {
  const config = configuration(process.env);
  console.info(
    'CONFIG_VALIDATED: HOST PORT DATABASE_URL DB_STATEMENT_MS DB_CONNECT_MS SHUTDOWN_MS',
  );
  const app = await createApplication();
  try {
    await app.listen(config.port, config.host);
  } catch (error) {
    await app.close();
    throw error;
  }
  termination(app, config.shutdownMs);
  console.info('API_LISTENING');
} catch {
  console.error('API_STARTUP_FAILED');
  process.exitCode = 1;
}
