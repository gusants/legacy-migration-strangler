import { DeleteMessageBatchCommand, ReceiveMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import { SqsChargeQueue } from './sqs-charge-queue.js';

const QUEUE_URL = 'http://q/charges-new';

const clientAnswering = (output: unknown) => {
  const send = vi.fn(async () => output);
  return { client: { send } as unknown as SQSClient, send };
};

describe('SqsChargeQueue', () => {
  it('long polls up to 10 messages asking for every message attribute and honours the abort signal', async () => {
    const { client, send } = clientAnswering({ Messages: [] });
    const signal = new AbortController().signal;

    await new SqsChargeQueue(client, QUEUE_URL).receive(signal, 10);

    const [command, options] = send.mock.calls[0] as unknown as [ReceiveMessageCommand, { abortSignal: AbortSignal }];
    expect(command.input).toEqual({
      QueueUrl: QUEUE_URL,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20,
      MessageAttributeNames: ['All'],
    });
    expect(options.abortSignal).toBe(signal);
  });

  it('maps messages and keeps only string attributes', async () => {
    const { client } = clientAnswering({
      Messages: [
        {
          MessageId: 'sqs-1',
          ReceiptHandle: 'rh-1',
          Body: '{"a":1}',
          MessageAttributes: {
            shadow: { DataType: 'String', StringValue: 'true' },
            blob: { DataType: 'Binary', BinaryValue: new Uint8Array([1]) },
          },
        },
        {},
      ],
    });

    const messages = await new SqsChargeQueue(client, QUEUE_URL).receive(new AbortController().signal, 10);

    expect(messages).toEqual([
      { id: 'sqs-1', receiptHandle: 'rh-1', body: '{"a":1}', attributes: { shadow: 'true' } },
      { id: '', receiptHandle: '', body: '', attributes: {} },
    ]);
  });

  it('treats a response without messages as an empty poll', async () => {
    const { client } = clientAnswering({});

    await expect(new SqsChargeQueue(client, QUEUE_URL).receive(new AbortController().signal, 10)).resolves.toEqual([]);
  });

  it('deletes the given receipt handles in one batch', async () => {
    const { client, send } = clientAnswering({ Successful: [{ Id: '0' }, { Id: '1' }] });

    await new SqsChargeQueue(client, QUEUE_URL).deleteBatch(['rh-1', 'rh-2']);

    const [command] = send.mock.calls[0] as unknown as [DeleteMessageBatchCommand];
    expect(command.input).toEqual({
      QueueUrl: QUEUE_URL,
      Entries: [
        { Id: '0', ReceiptHandle: 'rh-1' },
        { Id: '1', ReceiptHandle: 'rh-2' },
      ],
    });
  });

  it('does not call SQS when there is nothing to delete', async () => {
    const { client, send } = clientAnswering({});

    await new SqsChargeQueue(client, QUEUE_URL).deleteBatch([]);

    expect(send).not.toHaveBeenCalled();
  });

  it('fails when SQS reports entries that could not be deleted', async () => {
    const { client } = clientAnswering({ Failed: [{ Id: '1', Code: 'InternalError', SenderFault: false }] });

    await expect(new SqsChargeQueue(client, QUEUE_URL).deleteBatch(['rh-1', 'rh-2'])).rejects.toThrow(
      'failed to delete 1 message(s)',
    );
  });
});
