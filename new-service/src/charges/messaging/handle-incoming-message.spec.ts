import type { ChargeMessage } from '../application/charge-message.js';
import type { ChargeResult } from '../application/charge-result.js';
import type { LogFields, Logger } from '../../logging/logger.js';
import type { IncomingMessage } from './charge-queue.js';
import { createIncomingMessageHandler, type ChargeProcessor } from './handle-incoming-message.js';

const chargeBody = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    messageId: 'msg-1',
    chargeId: 'ch-1',
    amountCents: 10_000,
    dueDate: '2026-10-01',
    referenceDate: '2026-10-11',
    paid: true,
    planType: 'monthly',
    failedAttempts: 0,
    ...overrides,
  });

const incoming = (body: string): IncomingMessage => ({ id: 'sqs-1', receiptHandle: 'rh-1', body, attributes: {} });

const paidLate: ChargeResult = {
  chargeId: 'ch-1',
  status: 'paid_late',
  daysLate: 10,
  fineCents: 200,
  interestCents: 33,
  totalCents: 10_233,
};

const build = (execute: ChargeProcessor['execute'] = async () => paidLate) => {
  const executed: ChargeMessage[] = [];
  const logs: { level: string; fields: LogFields }[] = [];
  const logger: Logger = {
    info: (fields) => logs.push({ level: 'info', fields }),
    error: (fields) => logs.push({ level: 'error', fields }),
  };
  const handle = createIncomingMessageHandler(
    {
      execute: async (message) => {
        executed.push(message);
        return execute(message);
      },
    },
    logger,
  );
  return { handle, executed, logs };
};

describe('incoming message handler', () => {
  it('processes a valid message through the use case and logs the result', async () => {
    const { handle, executed, logs } = build();

    await expect(handle(incoming(chargeBody()))).resolves.toBe('processed');

    expect(executed).toEqual([JSON.parse(chargeBody())]);
    expect(logs).toEqual([
      {
        level: 'info',
        fields: { event: 'message_processed', sqsMessageId: 'sqs-1', messageId: 'msg-1', chargeId: 'ch-1', status: 'paid_late' },
      },
    ]);
  });

  it.each([
    ['malformed JSON', '{broken'],
    ['a payload the HTTP schema rejects', chargeBody({ amountCents: -1 })],
    ['a JSON that is not an object', '42'],
  ])('flags %s as invalid without touching the use case', async (_name, body) => {
    const { handle, executed, logs } = build();

    await expect(handle(incoming(body))).resolves.toBe('invalid');

    expect(executed).toEqual([]);
    expect(logs).toEqual([{ level: 'error', fields: { event: 'invalid_message', sqsMessageId: 'sqs-1' } }]);
  });

  it('reports a failure instead of throwing when the use case fails', async () => {
    const { handle, logs } = build(async () => {
      throw new Error('database is down');
    });

    await expect(handle(incoming(chargeBody()))).resolves.toBe('failed');

    expect(logs).toEqual([
      {
        level: 'error',
        fields: { event: 'message_failed', sqsMessageId: 'sqs-1', messageId: 'msg-1', chargeId: 'ch-1', error: 'database is down' },
      },
    ]);
  });

  it('reports non-Error failures as text', async () => {
    const { handle, logs } = build(async () => {
      throw 'boom';
    });

    await handle(incoming(chargeBody()));

    expect(logs[0]?.fields.error).toBe('boom');
  });
});
