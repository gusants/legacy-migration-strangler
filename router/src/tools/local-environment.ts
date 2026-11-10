import { loadRunnerEnv, type RunnerEnv } from '../config/env.js';
import { loadRepositoryEnv, settingOrDefault } from './repository-env.js';

const LOCAL_SQS_ENDPOINT = 'http://localhost:9324';

const ledgerDefaults: Record<string, string> = {
  ROUTER_DB_PORT: '5434',
  ROUTER_DB_NAME: 'router',
  ROUTER_DB_USER: 'router',
  ROUTER_DB_PASSWORD: 'router',
};

const localLedgerDatabaseUrl = (): string => {
  const setting = (name: string): string => encodeURIComponent(settingOrDefault(name, ledgerDefaults));
  return `postgresql://${setting('ROUTER_DB_USER')}:${setting('ROUTER_DB_PASSWORD')}@localhost:${setting('ROUTER_DB_PORT')}/${setting('ROUTER_DB_NAME')}`;
};

export const loadLocalToolsEnv = (): RunnerEnv => {
  loadRepositoryEnv();
  process.env.AWS_ACCESS_KEY_ID ??= 'local';
  process.env.AWS_SECRET_ACCESS_KEY ??= 'local';
  return loadRunnerEnv({
    SQS_ENDPOINT: LOCAL_SQS_ENDPOINT,
    ROUTING_LEDGER_DATABASE_URL: localLedgerDatabaseUrl(),
    ...process.env,
  });
};
