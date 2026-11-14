import 'dotenv/config';
import http from 'node:http';
import next from 'next';
import { createApp } from './app';
import { startJobs } from './jobs';
import { loadEnv } from './env';
import type { DataLayer } from './services/data';
import { createLogger } from './lib/logger';
import { createGoogleServices } from './services/google';

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env.logLevel, !env.isProduction && process.stdout.isTTY);

  const { google, auth, failures } = await createGoogleServices(env);
  const api = createApp({ env, google, logger, auth, failures });

  const jobs = startJobs(api.locals.data as DataLayer, google, logger);
  const nextApp = next({ dev: !env.isProduction, dir: process.cwd() });
  const handle = nextApp.getRequestHandler();
  await nextApp.prepare();
  api.all('/{*splat}', (req, res) => handle(req, res));

  const server = http.createServer(api);
  server.listen(env.port, () => {
    logger.info(
      { port: env.port, mode: env.googleMode },
      `Meetings Manager is running at ${env.appUrl}`,
    );
  });

  const stop = () => {
    jobs.stop();
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
