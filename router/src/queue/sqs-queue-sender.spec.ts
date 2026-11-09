import type { SQSClient } from '@aws-sdk/client-sqs';
import { SqsQueueSender } from './sqs-queue-sender.js';

const messages = ['0', '1', '2'].map((id) => ({ id, body: `body-${id}`, attributes: { a: id } }));

const senderReturning = (output: unknown): SqsQueueSender =>
  new SqsQueueSender({ send: async () => output } as unknown as SQSClient);

describe('SqsQueueSender', () => {
  it('reports no failure when every entry is in Successful', async () => {
    const sender = senderReturning({ Successful: [{ Id: '0' }, { Id: '1' }, { Id: '2' }] });

    await expect(sender.sendBatch('http://q', messages)).resolves.toEqual({ failures: [] });
  });

  it('carries the code and sender fault of entries listed in Failed', async () => {
    const sender = senderReturning({
      Successful: [{ Id: '0' }, { Id: '2' }],
      Failed: [{ Id: '1', Code: 'RequestThrottled', SenderFault: true }],
    });

    await expect(sender.sendBatch('http://q', messages)).resolves.toEqual({
      failures: [{ id: '1', code: 'RequestThrottled', senderFault: true }],
    });
  });

  it('treats entries absent from both Successful and Failed as failures', async () => {
    const sender = senderReturning({ Successful: [{ Id: '0' }] });

    await expect(sender.sendBatch('http://q', messages)).resolves.toEqual({
      failures: [
        { id: '1', code: 'MissingBatchResult', senderFault: false },
        { id: '2', code: 'MissingBatchResult', senderFault: false },
      ],
    });
  });

  it('treats an empty response as a failure of every entry', async () => {
    const result = await senderReturning({}).sendBatch('http://q', messages);

    expect(result.failures.map(({ id }) => id)).toEqual(['0', '1', '2']);
  });
});
