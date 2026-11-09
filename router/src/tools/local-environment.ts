import { loadRunnerEnv, type RunnerEnv } from '../config/env.js';

const LOCAL_SQS_ENDPOINT = 'http://localhost:9324';

export const loadLocalToolsEnv = (): RunnerEnv => {
  process.env.AWS_ACCESS_KEY_ID ??= 'local';
  process.env.AWS_SECRET_ACCESS_KEY ??= 'local';
  return loadRunnerEnv({ SQS_ENDPOINT: LOCAL_SQS_ENDPOINT, ...process.env });
};
