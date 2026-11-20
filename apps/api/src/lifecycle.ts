import type { NestExpressApplication } from '@nestjs/platform-express';
export function termination(app: NestExpressApplication, deadlineMs: number) {
  let closing = false;
  const stop = () => {
    if (closing) return;
    closing = true;
    console.info('SHUTDOWN_STARTED');
    const deadline = setTimeout(() => {
      console.error('SHUTDOWN_TIMEOUT');
      process.exit(1);
    }, deadlineMs);
    deadline.unref();
    void app
      .close()
      .then(() => {
        console.info('SHUTDOWN_COMPLETE');
      })
      .catch(() => {
        console.error('SHUTDOWN_FAILED');
        process.exitCode = 1;
      })
      .finally(() => {
        clearTimeout(deadline);
        dispose();
      });
  };
  const dispose = () => {
    process.off('SIGTERM', stop);
    process.off('SIGINT', stop);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  return dispose;
}
