import { loadRunnerEnv, type RunnerEnv } from '../config/env.js';

const LOCAL_SQS_ENDPOINT = 'http://localhost:9324';
const LOCAL_LEDGER_DATABASE_URL = 'postgresql://charges:charges@localhost:5433/charges';

export const loadLocalToolsEnv = (): RunnerEnv => {
  process.env.AWS_ACCESS_KEY_ID ??= 'local';
  process.env.AWS_SECRET_ACCESS_KEY ??= 'local';
  return loadRunnerEnv({
    SQS_ENDPOINT: LOCAL_SQS_ENDPOINT,
    ROUTING_LEDGER_DATABASE_URL: LOCAL_LEDGER_DATABASE_URL,
    ...process.env,
  });
};
