import { createApplication } from './bootstrap.js';
import { LISTEN_OPTIONS } from './app.module.js';
try {
  const app = await createApplication();
  const options = app.get<{ host: string; port: number }>(LISTEN_OPTIONS);
  try {
    await app.listen(options.port, options.host);
  } catch (error) {
    await app.close();
    throw error;
  }
  console.info('API listening on http://127.0.0.1:3000');
} catch {
  console.error('API startup failed');
  process.exitCode = 1;
}
