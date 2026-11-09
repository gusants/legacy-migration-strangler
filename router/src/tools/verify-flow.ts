import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { createConnection, type Connection, type RowDataPacket } from 'mysql2/promise';
import { newRunId, produceToLocalQueue } from './charge-producer.js';
import { generateCharges } from './charge-generator.js';
import { isFlowIntact, judgeFlow, type FlowVerdict } from './flow-verdict.js';
import { loadLocalToolsEnv } from './local-environment.js';

const DEFAULT_COUNT = 200;
const DEFAULT_SEED = 20_261_109;
const DEFAULT_TIMEOUT_SECONDS = 180;
const POLL_INTERVAL_MS = 1000;
const SETTLE_MS = 5000;
const MILLISECONDS_PER_SECOND = 1000;
const REPORTED_IDS_LIMIT = 10;

const databaseDefaults: Record<string, string> = {
  LEGACY_DB_HOST: '127.0.0.1',
  LEGACY_DB_PORT: '3307',
  LEGACY_DB_USER: 'legacy',
  LEGACY_DB_PASSWORD: 'legacy',
  LEGACY_DB_NAME: 'legacy',
};

const setting = (name: string): string => process.env[name] ?? databaseDefaults[name] ?? '';

const databaseConnection = (): Promise<Connection> =>
  createConnection({
    host: setting('LEGACY_DB_HOST'),
    port: Number(setting('LEGACY_DB_PORT')),
    user: setting('LEGACY_DB_USER'),
    password: setting('LEGACY_DB_PASSWORD'),
    database: setting('LEGACY_DB_NAME'),
  });

const storedMessageIds = async (connection: Connection, runId: string): Promise<string[]> => {
  const [rows] = await connection.query<RowDataPacket[]>(
    'SELECT message_id FROM charge_results WHERE message_id LIKE ?',
    [`${runId}\\_%`],
  );
  return rows.map((row) => String(row.message_id));
};

const waitForAll = async (
  connection: Connection,
  expectedIds: string[],
  runId: string,
  timeoutSeconds: number,
): Promise<void> => {
  const deadline = Date.now() + timeoutSeconds * MILLISECONDS_PER_SECOND;
  while (Date.now() < deadline) {
    const stored = await storedMessageIds(connection, runId);
    if (stored.length >= expectedIds.length) return;
    await sleep(POLL_INTERVAL_MS);
  }
};

const report = (verdict: FlowVerdict, runId: string): void => {
  const sample = (ids: string[]): string => ids.slice(0, REPORTED_IDS_LIMIT).join(', ') || '-';
  process.stdout.write(
    [
      `run ${runId}`,
      `expected=${verdict.expected} stored_rows=${verdict.rows} distinct=${verdict.distinct}`,
      `missing=${verdict.missing.length} (${sample(verdict.missing)})`,
      `unexpected=${verdict.unexpected.length} (${sample(verdict.unexpected)})`,
      isFlowIntact(verdict) ? 'RESULT: OK no loss, no duplicates' : 'RESULT: FAILED',
      '',
    ].join('\n'),
  );
};

const { values } = parseArgs({
  options: {
    count: { type: 'string', default: String(DEFAULT_COUNT) },
    seed: { type: 'string', default: String(DEFAULT_SEED) },
    invalid: { type: 'string', default: '0' },
    timeout: { type: 'string', default: String(DEFAULT_TIMEOUT_SECONDS) },
  },
});
const runId = newRunId();
const count = Number(values.count);
const expectedIds = generateCharges(count, Number(values.seed), runId).map(({ messageId }) => messageId);

await produceToLocalQueue(loadLocalToolsEnv(), {
  count,
  invalid: Number(values.invalid),
  seed: Number(values.seed),
  runId,
  ratePerSecond: 0,
});

const connection = await databaseConnection();
await waitForAll(connection, expectedIds, runId, Number(values.timeout));
await sleep(SETTLE_MS);
const verdict = judgeFlow(expectedIds, await storedMessageIds(connection, runId));
await connection.end();

report(verdict, runId);
process.exit(isFlowIntact(verdict) ? 0 : 1);
