import { Pool } from 'pg';
import type { Logger } from '../logging/logger.js';

const CONNECTION_TIMEOUT_MS = 5_000;
const IDLE_TIMEOUT_MS = 10_000;
const QUERY_TIMEOUT_MS = 10_000;

export const LAMBDA_LEDGER_POOL_SIZE = 2;
export const RUNNER_LEDGER_POOL_SIZE = 5;

export const createLedgerPool = (connectionString: string, maxConnections: number, logger: Logger): Pool => {
  const pool = new Pool({
    connectionString,
    max: maxConnections,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
    statement_timeout: QUERY_TIMEOUT_MS,
  });
  pool.on('error', (error) => {
    logger.error({ event: 'ledger_pool_error', error: error.message });
  });
  return pool;
};
