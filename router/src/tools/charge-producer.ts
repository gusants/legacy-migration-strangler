import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { createSqsClient } from '../config/create-sqs-client.js';
import type { RouterEnv } from '../config/env.js';
import type { OutgoingMessage, QueueSender } from '../queue/queue-sender.js';
import { SqsQueueSender } from '../queue/sqs-queue-sender.js';
import { generateCharges, generateInvalidBodies } from './charge-generator.js';

const SEND_BATCH_SIZE = 10;
const MILLISECONDS_PER_SECOND = 1000;

export type ProduceOptions = {
  count: number;
  invalid: number;
  seed: number;
  runId: string;
  ratePerSecond: number;
};

export type ProduceSummary = { runId: string; valid: number; invalid: number };

const interleave = (valid: string[], invalid: string[]): string[] => {
  const step = Math.max(1, Math.floor(valid.length / (invalid.length + 1)));
  const bodies = [...valid];
  invalid.forEach((body, index) => bodies.splice(Math.min((index + 1) * step + index, bodies.length), 0, body));
  return bodies;
};

const toBatches = (bodies: string[]): OutgoingMessage[][] =>
  Array.from({ length: Math.ceil(bodies.length / SEND_BATCH_SIZE) }, (_, batchIndex) =>
    bodies
      .slice(batchIndex * SEND_BATCH_SIZE, (batchIndex + 1) * SEND_BATCH_SIZE)
      .map((body, index) => ({ id: String(index), body, attributes: {} })),
  );

export const produceCharges = async (
  sender: QueueSender,
  queueUrl: string,
  options: ProduceOptions,
): Promise<ProduceSummary> => {
  const valid = generateCharges(options.count, options.seed, options.runId).map((charge) =>
    JSON.stringify(charge),
  );
  const invalid = generateInvalidBodies(options.invalid, options.runId);
  const pauseMs =
    options.ratePerSecond > 0 ? (SEND_BATCH_SIZE / options.ratePerSecond) * MILLISECONDS_PER_SECOND : 0;

  for (const batch of toBatches(interleave(valid, invalid))) {
    const { failedIds } = await sender.sendBatch(queueUrl, batch);
    if (failedIds.length > 0) {
      throw new Error(`queue rejected ${failedIds.length} message(s)`);
    }
    if (pauseMs > 0) await sleep(pauseMs);
  }
  return { runId: options.runId, valid: valid.length, invalid: invalid.length };
};

export const produceToLocalQueue = (env: RouterEnv, options: ProduceOptions): Promise<ProduceSummary> =>
  produceCharges(new SqsQueueSender(createSqsClient(env)), env.incomingQueueUrl, options);

export const newRunId = (): string => `run${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
