import type { LogFields, Logger } from '../../logging/logger.js';
import { ChargeConsumer } from './charge-consumer.js';
import type { ChargeQueue, IncomingMessage } from './charge-queue.js';
import type { IncomingMessageHandler, MessageOutcome } from './handle-incoming-message.js';

const message = (n: number): IncomingMessage => ({ id: `sqs-${n}`, receiptHandle: `rh-${n}`, body: `${n}`, attributes: {} });

const untilAborted = (signal: AbortSignal): Promise<never> =>
  new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });

const waitFor = async (condition: () => boolean): Promise<void> => {
  const deadline = Date.now() + 2_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

type Script = Array<IncomingMessage[] | Error>;

const build = (options: { script?: Script; outcomes?: (message: IncomingMessage) => Promise<MessageOutcome>; deleteFails?: boolean } = {}) => {
  const script = [...(options.script ?? [])];
  const deleted: string[][] = [];
  const logs: LogFields[] = [];
  const queue: ChargeQueue = {
    receive: async (signal) => {
      const next = script.shift();
      if (next instanceof Error) throw next;
      return next ?? untilAborted(signal);
    },
    deleteBatch: async (receiptHandles) => {
      deleted.push([...receiptHandles]);
      if (options.deleteFails) throw new Error('delete boom');
    },
  };
  const logger: Logger = { info: (fields) => logs.push(fields), error: (fields) => logs.push(fields) };
  const handle: IncomingMessageHandler = options.outcomes ?? (async () => 'processed');
  const consumer = new ChargeConsumer(queue, handle, logger, 1);
  return { consumer, deleted, logs };
};

describe('ChargeConsumer', () => {
  it('deletes only the messages that were processed', async () => {
    const outcomes: Record<string, MessageOutcome> = { 'sqs-1': 'processed', 'sqs-2': 'invalid', 'sqs-3': 'failed', 'sqs-4': 'processed' };
    const { consumer, deleted } = build({
      script: [[message(1), message(2), message(3), message(4)]],
      outcomes: async ({ id }) => outcomes[id] ?? 'failed',
    });

    consumer.start();
    await waitFor(() => deleted.length === 1);
    await consumer.stop();

    expect(deleted).toEqual([['rh-1', 'rh-4']]);
  });

  it('keeps invalid and failed messages in the queue so they reach the dead-letter queue by redelivery', async () => {
    const { consumer, deleted } = build({
      script: [[message(1), message(2)]],
      outcomes: async ({ id }) => (id === 'sqs-1' ? 'invalid' : 'failed'),
    });

    consumer.start();
    await waitFor(() => deleted.length === 1);
    await consumer.stop();

    expect(deleted).toEqual([[]]);
  });

  it('logs and keeps polling when the delete call fails', async () => {
    const { consumer, deleted, logs } = build({ script: [[message(1)], [message(2)]], deleteFails: true });

    consumer.start();
    await waitFor(() => deleted.length === 2);
    await consumer.stop();

    expect(logs).toContainEqual({ event: 'delete_failed', sqsMessageIds: ['sqs-1'], error: 'delete boom' });
  });

  it('logs and retries after a failed receive', async () => {
    const { consumer, deleted, logs } = build({ script: [new Error('queue unreachable'), [message(1)]] });

    consumer.start();
    await waitFor(() => deleted.length === 1);
    await consumer.stop();

    expect(logs).toContainEqual({ event: 'receive_failed', error: 'queue unreachable' });
  });

  it('logs non-Error receive failures as text', async () => {
    const queue: ChargeQueue = {
      receive: async (signal) => {
        if (!signal.aborted) throw 'plain failure';
        return [];
      },
      deleteBatch: async () => undefined,
    };
    const logs: LogFields[] = [];
    const consumer = new ChargeConsumer(queue, async () => 'processed', { info: () => undefined, error: (f) => logs.push(f) }, 1);

    consumer.start();
    await waitFor(() => logs.length > 0);
    await consumer.stop();

    expect(logs[0]).toEqual({ event: 'receive_failed', error: 'plain failure' });
  });

  it('starts only one loop when started twice', async () => {
    let receives = 0;
    const queue: ChargeQueue = {
      receive: (signal) => {
        receives += 1;
        return untilAborted(signal);
      },
      deleteBatch: async () => undefined,
    };
    const consumer = new ChargeConsumer(queue, async () => 'processed', { info: () => undefined, error: () => undefined }, 1);

    consumer.start();
    consumer.start();
    await waitFor(() => receives > 0);
    await consumer.stop();

    expect(receives).toBe(1);
  });

  it('stops promptly while idle in a long poll', async () => {
    const { consumer } = build();
    consumer.start();

    await expect(consumer.stop()).resolves.toBeUndefined();
  });

  it('finishes the batch in progress, deletes what succeeded and only then resolves stop', async () => {
    const release = deferred<MessageOutcome>();
    const started = deferred<void>();
    const { consumer, deleted } = build({
      script: [[message(1), message(2)]],
      outcomes: async ({ id }) => {
        started.resolve();
        return id === 'sqs-1' ? release.promise : 'processed';
      },
    });
    consumer.start();
    await started.promise;

    let stopped = false;
    const stopping = consumer.stop().then(() => {
      stopped = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stopped).toBe(false);
    expect(deleted).toEqual([]);

    release.resolve('processed');
    await stopping;

    expect(deleted).toEqual([['rh-1', 'rh-2']]);
  });

  it('does not poll again after stop was requested', async () => {
    let receives = 0;
    const queue: ChargeQueue = {
      receive: async () => {
        receives += 1;
        return [];
      },
      deleteBatch: async () => undefined,
    };
    const consumer = new ChargeConsumer(queue, async () => 'processed', { info: () => undefined, error: () => undefined }, 1);

    consumer.start();
    await consumer.stop();
    const receivesAtStop = receives;
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(receives).toBe(receivesAtStop);
  });
});
