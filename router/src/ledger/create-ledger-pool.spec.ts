import { createLedgerPool } from './create-ledger-pool.js';
import type { Logger } from '../logging/logger.js';

const URL = 'postgresql://router:router@localhost:1/router';

const recordingLogger = (): { logger: Logger; errors: Record<string, unknown>[] } => {
  const errors: Record<string, unknown>[] = [];
  return { logger: { info: () => undefined, error: (fields) => void errors.push(fields) }, errors };
};

describe('createLedgerPool', () => {
  it('logs an idle client error instead of letting it crash the process', async () => {
    const { logger, errors } = recordingLogger();
    const pool = createLedgerPool(URL, 2, logger);

    expect(() => pool.emit('error', new Error('terminating connection due to administrator command'))).not.toThrow();

    expect(errors).toEqual([
      { event: 'ledger_pool_error', error: 'terminating connection due to administrator command' },
    ]);
    await pool.end();
  });

  it('bounds the pool size, the connection wait and the query time', async () => {
    const pool = createLedgerPool(URL, 2, recordingLogger().logger);

    expect(pool.options).toMatchObject({
      max: 2,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
      query_timeout: 10_000,
      statement_timeout: 10_000,
    });
    await pool.end();
  });
});
