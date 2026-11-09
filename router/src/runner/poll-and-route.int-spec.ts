import type { Message } from '@aws-sdk/client-sqs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHandler } from '../handler.js';
import type { Logger } from '../logging/logger.js';
import { SqsQueueConsumer } from '../queue/sqs-queue-consumer.js';
import { SqsQueueSender } from '../queue/sqs-queue-sender.js';
import { FileRoutingConfigProvider } from '../routing/file-routing-config-provider.js';
import {
  startElasticMq,
  type ElasticMqTestEnvironment,
} from '../testing/elasticmq-test-environment.test-support.js';
import { pollAndRouteOnce, runUntilAborted, type PollAndRouteDependencies } from './poll-and-route.js';

const DLQ_DEADLINE_MS = 45_000;
const POLL_INTERVAL_MS = 250;

const chargeBody = (messageId: string): string =>
  JSON.stringify({
    messageId,
    chargeId: `ch_${messageId}`,
    amountCents: 10_000,
    dueDate: '2026-10-01',
    referenceDate: '2026-10-11',
    paid: true,
    planType: 'monthly',
    failedAttempts: 0,
  });

const stringAttributes = (message: Message | undefined): Record<string, string | undefined> =>
  Object.fromEntries(
    Object.entries(message?.MessageAttributes ?? {}).map(([name, value]) => [name, value.StringValue]),
  );

const waitUntil = async (condition: () => Promise<boolean>, deadlineMs: number): Promise<void> => {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`condition not met within ${deadlineMs}ms`);
};

const buildDependencies = (
  queues: ElasticMqTestEnvironment,
  routingPath: string,
  errors: Record<string, unknown>[],
): PollAndRouteDependencies => {
  const logger: Logger = { info: () => undefined, error: (fields) => void errors.push(fields) };
  return {
    consumer: new SqsQueueConsumer(queues.client),
    handler: createHandler({
      configProvider: new FileRoutingConfigProvider(routingPath),
      sender: new SqsQueueSender(queues.client),
      queueUrls: { legacy: queues.queueUrl('charges-legacy'), new: queues.queueUrl('charges-new') },
      logger,
    }),
    logger,
    queueUrl: queues.queueUrl('charges-incoming'),
    queueArn: 'arn:aws:sqs:us-east-1:000000000000:charges-incoming',
    region: 'us-east-1',
    waitTimeSeconds: 1,
  };
};

describe('router flow against ElasticMQ', () => {
  let queues: ElasticMqTestEnvironment;
  let directory: string;
  let routingPath: string;
  let deps: PollAndRouteDependencies;
  const errors: Record<string, unknown>[] = [];

  beforeAll(async () => {
    queues = await startElasticMq();
    directory = await mkdtemp(join(tmpdir(), 'router-int-'));
    routingPath = join(directory, 'routing.json');
    deps = buildDependencies(queues, routingPath, errors);
  });

  beforeEach(async () => {
    errors.length = 0;
    await queues.purgeAll();
    await writeFile(routingPath, '{"mode":"legacy"}');
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
    await queues.stop();
  });

  it('moves a valid message to charges-legacy untouched and deletes it from incoming', async () => {
    const body = chargeBody('flow-1');
    await queues.send('charges-incoming', body);

    await pollAndRouteOnce(deps, new AbortController().signal);

    const [forwarded, ...rest] = await queues.drain('charges-legacy');
    expect(rest).toEqual([]);
    expect(forwarded?.Body).toBe(body);
    expect(stringAttributes(forwarded)).toEqual({
      messageId: 'flow-1',
      chargeId: 'ch_flow-1',
      routingMode: 'legacy',
    });
    await expect(queues.visibleCount('charges-incoming')).resolves.toBe(0);
  });

  it('keeps the message in incoming and logs the error when the mode is not implemented', async () => {
    await writeFile(routingPath, '{"mode":"new"}');
    await queues.send('charges-incoming', chargeBody('flow-unsupported'));

    await pollAndRouteOnce(deps, new AbortController().signal);

    expect(errors).toEqual([
      expect.objectContaining({ event: 'routing_failed', messageId: 'flow-unsupported' }),
    ]);
    await waitUntil(async () => (await queues.visibleCount('charges-incoming')) === 1, 5000);
    await expect(queues.drain('charges-new')).resolves.toEqual([]);
    await expect(queues.drain('charges-legacy')).resolves.toEqual([]);
  });

  it('sends invalid JSON to the incoming DLQ after 5 receives while valid messages flow through', async () => {
    await queues.send('charges-incoming', '{this is not json');
    await queues.send('charges-incoming', chargeBody('flow-good'));
    const stop = new AbortController();

    const running = runUntilAborted(deps, stop.signal);
    await waitUntil(async () => (await queues.visibleCount('charges-incoming-dlq')) === 1, DLQ_DEADLINE_MS);
    stop.abort();
    await running;

    const [dead] = await queues.drain('charges-incoming-dlq');
    expect(dead?.Body).toBe('{this is not json');
    const forwarded = await queues.drain('charges-legacy');
    expect(forwarded.map(({ Body }) => Body)).toEqual([chargeBody('flow-good')]);
    await expect(queues.visibleCount('charges-incoming')).resolves.toBe(0);
  });
});
