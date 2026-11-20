import { createApplication } from '../../apps/api/dist/bootstrap.js';
import { termination } from '../../apps/api/dist/lifecycle.js';
const app = await createApplication();
app
  .getHttpAdapter()
  .getInstance()
  .get('/slow-test-only', (_request, response) => {
    process.send?.({ event: 'started' });
    setTimeout(() => response.end('done'), Number(process.env.TEST_DELAY_MS));
  });
await app.listen(0, '127.0.0.1');
termination(app, Number(process.env.SHUTDOWN_MS));
process.send?.({
  event: 'listening',
  port: app.getHttpServer().address().port,
});
process.channel?.unref();
