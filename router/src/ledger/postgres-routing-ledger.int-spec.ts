import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { ledgerMessageKeyOf } from './ledger-message-key.js';
import { PostgresRoutingLedger } from './postgres-routing-ledger.js';

const CONCURRENT_CLAIMS = 10;

describe('PostgresRoutingLedger', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let ledger: PostgresRoutingLedger;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    ledger = new PostgresRoutingLedger(pool);
    await ledger.ensureSchema();
  });

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  it('creates the schema idempotently', async () => {
    await expect(ledger.ensureSchema()).resolves.toBeUndefined();
  });

  it('records the first service and returns it', async () => {
    await expect(ledger.claim('first', 'new', 'percentage')).resolves.toBe('new');

    const { rows } = await pool.query('SELECT service, routing_mode FROM router.routing_ledger WHERE message_key = $1', [ledgerMessageKeyOf('first')]);
    expect(rows).toEqual([{ service: 'new', routing_mode: 'percentage' }]);
  });

  it('returns the recorded service for a later claim of another one and keeps the record', async () => {
    await ledger.claim('replayed', 'legacy', 'shadow');

    await expect(ledger.claim('replayed', 'new', 'percentage')).resolves.toBe('legacy');

    const { rows } = await pool.query('SELECT service, routing_mode FROM router.routing_ledger WHERE message_key = $1', [ledgerMessageKeyOf('replayed')]);
    expect(rows).toEqual([{ service: 'legacy', routing_mode: 'shadow' }]);
  });

  it('converges on one service when concurrent claims race for the same message', async () => {
    const claims = Array.from({ length: CONCURRENT_CLAIMS }, (_, index) =>
      ledger.claim('raced', index % 2 === 0 ? 'legacy' : 'new', 'percentage'),
    );

    const services = await Promise.all(claims);

    expect(new Set(services).size).toBe(1);
    const { rows } = await pool.query('SELECT service FROM router.routing_ledger WHERE message_key = $1', [ledgerMessageKeyOf('raced')]);
    expect(rows).toHaveLength(1);
    expect(rows[0].service).toBe(services[0]);
  });

  it('keeps messages independent', async () => {
    await ledger.claim('other-a', 'legacy', 'legacy');

    await expect(ledger.claim('other-b', 'new', 'new')).resolves.toBe('new');
  });

  it('stores a readable message_id for a plain id', async () => {
    await ledger.claim('readable-é', 'legacy', 'legacy');

    const { rows } = await pool.query('SELECT message_id FROM router.routing_ledger WHERE message_key = $1', [
      ledgerMessageKeyOf('readable-é'),
    ]);
    expect(rows).toEqual([{ message_id: 'readable-é' }]);
  });

  it('accepts an id with NUL and records it without a readable message_id', async () => {
    await expect(ledger.claim('nul\u0000id', 'legacy', 'legacy')).resolves.toBe('legacy');
    await expect(ledger.claim('nul\u0000id', 'new', 'new')).resolves.toBe('legacy');

    const { rows } = await pool.query('SELECT message_id FROM router.routing_ledger WHERE message_key = $1', [
      ledgerMessageKeyOf('nul\u0000id'),
    ]);
    expect(rows).toEqual([{ message_id: null }]);
  });

  it('keeps ids that differ only by lone surrogates apart even though UTF-8 would collapse them', async () => {
    await ledger.claim('lone-\uD800', 'legacy', 'legacy');

    await expect(ledger.claim('lone-\uD801', 'new', 'new')).resolves.toBe('new');
    await expect(ledger.claim('lone-\uFFFD', 'new', 'new')).resolves.toBe('new');
    await expect(ledger.claim('lone-\uD800', 'new', 'new')).resolves.toBe('legacy');
  });
});
