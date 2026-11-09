import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { createHandler } from './handler.js';
import type { LogFields, Logger } from './logging/logger.js';
import type { OutgoingMessage, QueueSender } from './queue/queue-sender.js';
import type { RoutingDecision } from './routing/decide-route.js';
import { pureRoutePlanner } from './routing/pure-route-planner.js';
import type { RoutePlanner } from './routing/route-planner.js';
import type { RoutingConfig, RoutingConfigResolution, RoutingConfigResolver } from './routing/routing-config.js';

const QUEUE_URLS = { legacy: 'http://q/legacy', new: 'http://q/new' };

const body = (n: number) => JSON.stringify({ messageId: `m${n}`, chargeId: `c${n}`, amountCents: n });

const record = (n: number, recordBody = body(n)): SQSRecord => ({
  messageId: `sqs-${n}`,
  receiptHandle: `rh-${n}`,
  body: recordBody,
  attributes: {} as SQSRecord['attributes'],
  messageAttributes: {},
  md5OfBody: '',
  eventSource: 'aws:sqs',
  eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:charges-incoming',
  awsRegion: 'us-east-1',
});

const rejected = (...ids: string[]) => ({
  failures: ids.map((id) => ({ id, code: 'InternalError', senderFault: false })),
});

const eventOf = (...records: SQSRecord[]): SQSEvent => ({ Records: records });

type Sent = { queueUrl: string; messages: readonly OutgoingMessage[] };

const buildHandler = (options: {
  config?: RoutingConfig | Error;
  fallbackReason?: string;
  sendBatch?: QueueSender['sendBatch'];
  planner?: RoutePlanner;
} = {}) => {
  const sent: Sent[] = [];
  const logs: { level: 'info' | 'error'; fields: LogFields }[] = [];
  const config = options.config ?? { mode: 'legacy' };
  const configResolver: RoutingConfigResolver = {
    resolve: async (): Promise<RoutingConfigResolution> => {
      if (config instanceof Error) throw config;
      return options.fallbackReason === undefined
        ? { config }
        : { config, fallbackReason: options.fallbackReason };
    },
  };
  const sender: QueueSender = {
    sendBatch:
      options.sendBatch ??
      (async (queueUrl, messages) => {
        sent.push({ queueUrl, messages });
        return { failures: [] };
      }),
  };
  const logger: Logger = {
    info: (fields) => logs.push({ level: 'info', fields }),
    error: (fields) => logs.push({ level: 'error', fields }),
  };
  const handler = createHandler({ configResolver, planner: options.planner ?? pureRoutePlanner, sender, queueUrls: QUEUE_URLS, logger });
  return { handler, sent, logs };
};

describe('router handler', () => {
  it('forwards messages to the legacy queue with the body untouched and routing attributes', async () => {
    const { handler, sent } = buildHandler();

    const response = await handler(eventOf(record(1), record(2)));

    expect(response).toEqual({ batchItemFailures: [] });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.queueUrl).toBe(QUEUE_URLS.legacy);
    expect(sent[0]?.messages).toEqual([
      { id: '0', body: body(1), attributes: { messageId: 'm1', chargeId: 'c1', routingMode: 'legacy', routingRole: 'primary' } },
      { id: '1', body: body(2), attributes: { messageId: 'm2', chargeId: 'c2', routingMode: 'legacy', routingRole: 'primary' } },
    ]);
  });

  it('logs one structured decision per routed message', async () => {
    const { handler, logs } = buildHandler();

    await handler(eventOf(record(1)));

    expect(logs).toEqual([
      {
        level: 'info',
        fields: { event: 'routed', messageId: 'm1', chargeId: 'c1', mode: 'legacy', destination: 'legacy', role: 'primary' },
      },
    ]);
  });

  it('splits sends into batches of at most 10 entries', async () => {
    const { handler, sent } = buildHandler();
    const records = Array.from({ length: 23 }, (_, index) => record(index));

    const response = await handler(eventOf(...records));

    expect(response.batchItemFailures).toEqual([]);
    expect(sent.map(({ messages }) => messages.length)).toEqual([10, 10, 3]);
  });

  it('splits sends so no SendMessageBatch call exceeds 256 KB', async () => {
    const { handler, sent } = buildHandler();
    const bigBody = (n: number) => JSON.stringify({ messageId: `m${n}`, chargeId: `c${n}`, padding: 'x'.repeat(100_000) });

    const response = await handler(eventOf(record(1, bigBody(1)), record(2, bigBody(2)), record(3, bigBody(3))));

    expect(response.batchItemFailures).toEqual([]);
    expect(sent.map(({ messages }) => messages.length).sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('logs why SendMessageBatch rejected an entry', async () => {
    const { handler, logs } = buildHandler({
      sendBatch: async () => ({ failures: [{ id: '1', code: 'RequestThrottled', senderFault: true }] }),
    });

    await handler(eventOf(record(1), record(2)));

    expect(logs).toContainEqual({
      level: 'error',
      fields: { event: 'send_rejected', messageId: 'm2', destination: 'legacy', code: 'RequestThrottled', senderFault: true },
    });
  });

  it('does nothing for an empty event', async () => {
    const { handler, sent } = buildHandler();

    await expect(handler(eventOf())).resolves.toEqual({ batchItemFailures: [] });
    expect(sent).toEqual([]);
  });

  it.each([
    ['invalid JSON', record(1, '{nope')],
    ['a payload without messageId', record(1, '{"chargeId":"c1"}')],
    ['a payload without chargeId', record(1, '{"messageId":"m1"}')],
  ])('reports %s as a batch item failure and still routes the others', async (_name, bad) => {
    const { handler, sent, logs } = buildHandler();

    const response = await handler(eventOf(bad, record(2)));

    expect(response.batchItemFailures).toEqual([{ itemIdentifier: 'sqs-1' }]);
    expect(sent[0]?.messages.map(({ id }) => id)).toEqual(['1']);
    expect(logs.some(({ level, fields }) => level === 'error' && fields.event === 'invalid_message')).toBe(true);
  });

  it('reports only the entries SendMessageBatch rejected', async () => {
    const { handler, logs } = buildHandler({
      sendBatch: async () => rejected('1'),
    });

    const response = await handler(eventOf(record(1), record(2), record(3)));

    expect(response.batchItemFailures).toEqual([{ itemIdentifier: 'sqs-2' }]);
    const routed = logs.filter(({ fields }) => fields.event === 'routed').map(({ fields }) => fields.messageId);
    expect(routed).toEqual(['m1', 'm3']);
  });

  it('fails every record of a chunk when the send call itself throws', async () => {
    const { handler, logs } = buildHandler({
      sendBatch: async () => {
        throw new Error('network down');
      },
    });

    const response = await handler(eventOf(record(1), record(2)));

    expect(response.batchItemFailures).toEqual([{ itemIdentifier: 'sqs-1' }, { itemIdentifier: 'sqs-2' }]);
    expect(logs).toEqual([
      { level: 'error', fields: { event: 'send_failed', destination: 'legacy', affectedRecords: 2, error: 'network down' } },
    ]);
  });

  it('describes non-Error throwables in the log', async () => {
    const { handler, logs } = buildHandler({
      sendBatch: async () => {
        throw 'boom';
      },
    });

    await handler(eventOf(record(1)));

    expect(logs[0]?.fields.error).toBe('boom');
  });

  it('keeps routing with the last valid config and reports why the new one was ignored', async () => {
    const { handler, sent, logs } = buildHandler({ fallbackReason: 'routing config is not valid JSON' });

    const response = await handler(eventOf(record(1), record(2)));

    expect(response.batchItemFailures).toEqual([]);
    expect(sent[0]?.messages).toHaveLength(2);
    expect(logs[0]).toEqual({
      level: 'error',
      fields: {
        event: 'config_invalid_using_last_valid',
        error: 'routing config is not valid JSON',
        affectedRecords: 2,
      },
    });
  });

  it('fails the whole batch and logs when the routing config cannot be loaded', async () => {
    const { handler, sent, logs } = buildHandler({ config: new Error('bad routing.json') });

    const response = await handler(eventOf(record(1), record(2)));

    expect(response.batchItemFailures).toEqual([{ itemIdentifier: 'sqs-1' }, { itemIdentifier: 'sqs-2' }]);
    expect(sent).toEqual([]);
    expect(logs).toEqual([{ level: 'error', fields: { event: 'config_failed', error: 'bad routing.json', affectedRecords: 2 } }]);
  });

  it('fails every record visibly, without sending, in a mode that is not implemented', async () => {
    const { handler, sent, logs } = buildHandler({ config: { mode: 'new' } });

    const response = await handler(eventOf(record(1), record(2)));

    expect(response.batchItemFailures).toEqual([{ itemIdentifier: 'sqs-1' }, { itemIdentifier: 'sqs-2' }]);
    expect(sent).toEqual([]);
    expect(logs).toHaveLength(2);
    expect(logs[0]).toEqual({
      level: 'error',
      fields: { event: 'routing_failed', messageId: 'm1', chargeId: 'c1', error: 'routing mode "new" is not implemented' },
    });
  });

  describe('with a shadow copy', () => {
    const shadowDecision: RoutingDecision = {
      mode: 'shadow',
      targets: [
        { queue: 'legacy', role: 'primary' },
        { queue: 'new', role: 'shadow' },
      ],
    };
    const shadowPlanner: RoutePlanner = { plan: async () => shadowDecision };

    it('marks every copy with its routing role', async () => {
      const { handler, sent } = buildHandler({ planner: shadowPlanner });

      const response = await handler(eventOf(record(1)));

      expect(response.batchItemFailures).toEqual([]);
      const attributesByQueue = Object.fromEntries(
        sent.map(({ queueUrl, messages }) => [queueUrl, messages[0]?.attributes]),
      );
      expect(attributesByQueue).toEqual({
        [QUEUE_URLS.legacy]: { messageId: 'm1', chargeId: 'c1', routingMode: 'shadow', routingRole: 'primary' },
        [QUEUE_URLS.new]: { messageId: 'm1', chargeId: 'c1', routingMode: 'shadow', routingRole: 'shadow' },
      });
    });

    it('does not fail the official message when only the shadow send is rejected', async () => {
      const { handler, logs } = buildHandler({
        planner: shadowPlanner,
        sendBatch: async (queueUrl) => (queueUrl === QUEUE_URLS.new ? rejected('0') : rejected()),
      });

      const response = await handler(eventOf(record(1)));

      expect(response.batchItemFailures).toEqual([]);
      expect(logs).toContainEqual({
        level: 'error',
        fields: { event: 'shadow_send_failed', messageId: 'm1', chargeId: 'c1', destination: 'new' },
      });
      expect(logs).toContainEqual({
        level: 'info',
        fields: { event: 'routed', messageId: 'm1', chargeId: 'c1', mode: 'shadow', destination: 'legacy', role: 'primary' },
      });
    });

    it('does not fail the official message when the shadow send throws', async () => {
      const { handler } = buildHandler({
        planner: shadowPlanner,
        sendBatch: async (queueUrl) => {
          if (queueUrl === QUEUE_URLS.new) throw new Error('new queue down');
          return { failures: [] };
        },
      });

      await expect(handler(eventOf(record(1)))).resolves.toEqual({ batchItemFailures: [] });
    });

    it('fails the record when the primary send is rejected, even if the shadow copy went through', async () => {
      const { handler, logs } = buildHandler({
        planner: shadowPlanner,
        sendBatch: async (queueUrl) => (queueUrl === QUEUE_URLS.legacy ? rejected('0') : rejected()),
      });

      const response = await handler(eventOf(record(1)));

      expect(response.batchItemFailures).toEqual([{ itemIdentifier: 'sqs-1' }]);
      expect(logs.some(({ fields }) => fields.event === 'shadow_send_failed')).toBe(false);
    });
  });

  it('fails the record and sends nothing when the plan repeats a queue', async () => {
    const repeatedQueue: RoutePlanner = {
      plan: async () => ({
        mode: 'shadow',
        targets: [
          { queue: 'new', role: 'primary' },
          { queue: 'new', role: 'shadow' },
        ],
      }),
    };
    const { handler, sent, logs } = buildHandler({ planner: repeatedQueue });

    const response = await handler(eventOf(record(1)));

    expect(response.batchItemFailures).toEqual([{ itemIdentifier: 'sqs-1' }]);
    expect(sent).toEqual([]);
    expect(logs).toContainEqual({
      level: 'error',
      fields: { event: 'routing_failed', messageId: 'm1', chargeId: 'c1', error: 'routing plan targets queue "new" more than once' },
    });
  });

  it('plans each record through an asynchronous planner', async () => {
    const delayedPlanner: RoutePlanner = {
      plan: async (message, config) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return pureRoutePlanner.plan(message, config);
      },
    };
    const { handler, sent } = buildHandler({ planner: delayedPlanner });

    const response = await handler(eventOf(record(1), record(2)));

    expect(response.batchItemFailures).toEqual([]);
    expect(sent[0]?.messages.map(({ id }) => id)).toEqual(['0', '1']);
  });
});
