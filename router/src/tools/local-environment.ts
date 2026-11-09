import { loadRouterEnv, type RouterEnv } from '../config/env.js';

const LOCAL_SQS_ENDPOINT = 'http://localhost:9324';

export const loadLocalToolsEnv = (): RouterEnv => {
  process.env.AWS_ACCESS_KEY_ID ??= 'local';
  process.env.AWS_SECRET_ACCESS_KEY ??= 'local';
  return loadRouterEnv({ SQS_ENDPOINT: LOCAL_SQS_ENDPOINT, ...process.env });
};
