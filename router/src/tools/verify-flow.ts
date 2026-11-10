import { setTimeout as sleep } from 'node:timers/promises';
import type { SQSClient } from '@aws-sdk/client-sqs';
import type { Connection } from 'mysql2/promise';
import { createSqsClient } from '../config/create-sqs-client.js';
import type { RunnerEnv } from '../config/env.js';
import { generateCharges } from './charge-generator.js';
import { newRunId, produceToLocalQueue } from './charge-producer.js';
import { describeVerdict, isFlowIntact, judgeFlow, type QueueSnapshot } from './flow-verdict.js';
import { connectLegacyDatabase, storedMessageIds } from './legacy-results.js';
import { fileURLToPath } from 'node:url';
import { FileRoutingConfigProvider } from '../routing/file-routing-config-provider.js';
import { loadLocalToolsEnv } from './local-environment.js';
import { takeQueueSnapshot } from './queue-snapshot.js';
import { connectNewResults, type NewResults } from './new-results.js';
import { parseRoutedCopies, readRouterLogs } from './router-logs.js';
import { parseVerifyOptions, type VerifyOptions } from './verify-options.js';

const ROUTING_CONFIG_PATH = fileURLToPath(new URL('../../config/routing.json', import.meta.url));
const POLL_INTERVAL_MS = 1000;
const SETTLE_MS = 5000;
const MILLISECONDS_PER_SECOND = 1000;
const LOG_CLOCK_MARGIN_MS = 60_000;

type Run = {
  options: VerifyOptions;
  runId: string;
  env: RunnerEnv;
  client: SQSClient;
  connection: Connection;
  newResults: NewResults;
  before: QueueSnapshot;
};

const isComplete = async ({ options, runId, client, env, connection, newResults, before }: Run): Promise<boolean> => {
  const legacyStored = await storedMessageIds(connection, runId);
  const newStored = await newResults.storedIds('charge_results', runId);
  const now = await takeQueueSnapshot(client, env);
  return (
    legacyStored.length + newStored.length >= options.count &&
    now.incomingDlq - before.incomingDlq >= options.invalid &&
    now.incomingPending === 0
  );
};

const waitForCompletion = async (run: Run): Promise<void> => {
  const deadline = Date.now() + run.options.timeoutSeconds * MILLISECONDS_PER_SECOND;
  while (Date.now() < deadline && !(await isComplete(run))) {
    await sleep(POLL_INTERVAL_MS);
  }
};

const verify = async (options: VerifyOptions): Promise<boolean> => {
  const env = loadLocalToolsEnv();
  const client = createSqsClient(env);
  const connection = await connectLegacyDatabase();
  const { mode } = await new FileRoutingConfigProvider(ROUTING_CONFIG_PATH).load();
  const newResults = await connectNewResults({ optional: mode === 'legacy' });
  const runId = newRunId();
  const startedAt = new Date();
  const before = await takeQueueSnapshot(client, env);
  const run: Run = { options, runId, env, client, connection, newResults, before };

  try {
    await produceToLocalQueue(env, { ...options, runId, ratePerSecond: 0 });
    await waitForCompletion(run);
    await sleep(SETTLE_MS);

    const routerLogs = await readRouterLogs(new Date(startedAt.getTime() - LOG_CLOCK_MARGIN_MS));
    const verdict = judgeFlow({
      expectedIds: generateCharges(options.count, options.seed, runId).map(({ messageId }) => messageId),
      legacyStoredIds: await storedMessageIds(connection, runId),
      newStoredIds: await newResults.storedIds('charge_results', runId),
      shadowStoredIds: await newResults.storedIds('charge_results_shadow', runId),
      routedCopies: parseRoutedCopies(routerLogs, `${runId}_`),
      invalidInjected: options.invalid,
      before,
      after: await takeQueueSnapshot(client, env),
    });
    process.stdout.write(describeVerdict(verdict, runId));
    return isFlowIntact(verdict);
  } finally {
    await connection.end();
    await newResults.close();
    client.destroy();
  }
};

try {
  process.exit((await verify(parseVerifyOptions(process.argv.slice(2)))) ? 0 : 1);
} catch (error) {
  process.stderr.write(`verify-flow aborted: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}
