import { setTimeout as sleep } from 'node:timers/promises';
import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import type { Logger } from '../logging/logger.js';
import type { QueueConsumer } from '../queue/queue-consumer.js';
import { toSqsEvent } from './to-sqs-event.js';

const RECEIVE_BATCH_SIZE = 10;
const RECEIVE_WAIT_SECONDS = 20;
const ERROR_BACKOFF_MS = 2000;

export type PollAndRouteDependencies = {
  consumer: QueueConsumer;
  handler: (event: SQSEvent) => Promise<SQSBatchResponse>;
  logger: Logger;
  queueUrl: string;
  queueArn: string;
  region: string;
  waitTimeSeconds?: number;
};

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const pollAndRouteOnce = async (
  deps: PollAndRouteDependencies,
  signal: AbortSignal,
): Promise<void> => {
  const messages = await deps.consumer.receive(deps.queueUrl, {
    maxMessages: RECEIVE_BATCH_SIZE,
    waitTimeSeconds: deps.waitTimeSeconds ?? RECEIVE_WAIT_SECONDS,
    signal,
  });
  if (messages.length === 0) return;

  const response = await deps.handler(toSqsEvent(messages, deps.queueArn, deps.region));
  const failedIds = new Set(response.batchItemFailures.map(({ itemIdentifier }) => itemIdentifier));
  const succeeded = messages.filter(({ messageId }) => !failedIds.has(messageId));
  await deps.consumer.deleteBatch(
    deps.queueUrl,
    succeeded.map(({ receiptHandle }) => receiptHandle),
  );
  deps.logger.info({
    event: 'batch_done',
    received: messages.length,
    deleted: succeeded.length,
    failed: failedIds.size,
  });
};

export const runUntilAborted = async (
  deps: PollAndRouteDependencies,
  signal: AbortSignal,
): Promise<void> => {
  while (!signal.aborted) {
    try {
      await pollAndRouteOnce(deps, signal);
    } catch (error) {
      if (signal.aborted) return;
      deps.logger.error({ event: 'runner_error', error: errorText(error) });
      await sleep(ERROR_BACKOFF_MS, undefined, { signal }).catch(() => undefined);
    }
  }
};
