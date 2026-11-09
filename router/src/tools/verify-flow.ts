import { setTimeout as sleep } from 'node:timers/promises';
import type { SQSClient } from '@aws-sdk/client-sqs';
import type { Connection } from 'mysql2/promise';
import { createSqsClient } from '../config/create-sqs-client.js';
import type { RunnerEnv } from '../config/env.js';
import { generateCharges } from './charge-generator.js';
import { newRunId, produceToLocalQueue } from './charge-producer.js';
import { describeVerdict, isFlowIntact, judgeFlow, type QueueSnapshot } from './flow-verdict.js';
import { connectLegacyDatabase, storedMessageIds } from './legacy-results.js';
import { loadLocalToolsEnv } from './local-environment.js';
import { takeQueueSnapshot } from './queue-snapshot.js';
import { parsePrimaryRoutedMessageIds, parseShadowRoutedMessageIds, readRouterLogs } from './router-logs.js';
import { parseVerifyOptions, type VerifyOptions } from './verify-options.js';

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
  before: QueueSnapshot;
};

const isComplete = async ({ options, runId, client, env, connection, before }: Run): Promise<boolean> => {
  const stored = await storedMessageIds(connection, runId);
  const now = await takeQueueSnapshot(client, env);
  return (
    stored.length >= options.count &&
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
  const runId = newRunId();
  const startedAt = new Date();
  const before = await takeQueueSnapshot(client, env);
  const run: Run = { options, runId, env, client, connection, before };

  try {
    await produceToLocalQueue(env, { ...options, runId, ratePerSecond: 0 });
    await waitForCompletion(run);
    await sleep(SETTLE_MS);

    const routerLogs = await readRouterLogs(new Date(startedAt.getTime() - LOG_CLOCK_MARGIN_MS));
    const verdict = judgeFlow({
      expectedIds: generateCharges(options.count, options.seed, runId).map(({ messageId }) => messageId),
      storedIds: await storedMessageIds(connection, runId),
      routedIds: parsePrimaryRoutedMessageIds(routerLogs, `${runId}_`),
      shadowRoutedIds: parseShadowRoutedMessageIds(routerLogs, `${runId}_`),
      invalidInjected: options.invalid,
      before,
      after: await takeQueueSnapshot(client, env),
    });
    process.stdout.write(describeVerdict(verdict, runId));
    return isFlowIntact(verdict);
  } finally {
    await connection.end();
    client.destroy();
  }
};

try {
  process.exit((await verify(parseVerifyOptions(process.argv.slice(2)))) ? 0 : 1);
} catch (error) {
  process.stderr.write(`verify-flow aborted: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}
