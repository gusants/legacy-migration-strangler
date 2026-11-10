import { createSqsClient } from '../config/create-sqs-client.js';
import { createLedgerPool, RUNNER_LEDGER_POOL_SIZE } from '../ledger/create-ledger-pool.js';
import { PostgresRoutingLedger } from '../ledger/postgres-routing-ledger.js';
import { jsonLogger } from '../logging/logger.js';
import { messageIdsPinnedToLegacy } from './legacy-pins.js';
import { loadLocalToolsEnv } from './local-environment.js';
import { peekQueueBodies } from './peek-queue.js';

const USAGE = 'usage: pnpm legacy-pins <queue-name> [<queue-name> ...]';
const PINNED_EXIT_CODE = 1;
const ERROR_EXIT_CODE = 3;

const queueNames = process.argv.slice(2);

if (queueNames.length === 0) {
  process.stderr.write(`${USAGE}\n`);
  process.exit(ERROR_EXIT_CODE);
}

const env = loadLocalToolsEnv();
const client = createSqsClient(env);
const pool = createLedgerPool(env.ledgerDatabaseUrl, RUNNER_LEDGER_POOL_SIZE, jsonLogger);
const ledger = new PostgresRoutingLedger(pool);
const urlOf = (queueName: string): string => new URL(queueName, env.incomingQueueUrl).toString();

let exitCode = 0;
try {
  for (const queueName of queueNames) {
    const bodies = await peekQueueBodies(client, urlOf(queueName));
    const pinned = await messageIdsPinnedToLegacy(bodies, (messageId) => ledger.recordedServiceOf(messageId));
    process.stdout.write(`${queueName}: ${bodies.length} message(s), ${pinned.length} pinned to legacy\n`);
    for (const messageId of pinned) process.stdout.write(`  pinned ${JSON.stringify(messageId)}\n`);
    if (pinned.length > 0) exitCode = PINNED_EXIT_CODE;
  }
} catch (error) {
  process.stderr.write(`legacy-pins failed: ${error instanceof Error ? error.message : String(error)}\n`);
  exitCode = ERROR_EXIT_CODE;
} finally {
  await pool.end();
}
process.exit(exitCode);
