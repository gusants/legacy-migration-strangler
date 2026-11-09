import {
  DeleteMessageBatchCommand,
  ReceiveMessageCommand,
  type Message,
  type MessageAttributeValue,
  type SQSClient,
} from '@aws-sdk/client-sqs';
import type { ChargeQueue, IncomingMessage } from './charge-queue.js';

const LONG_POLL_SECONDS = 20;

const toStringAttributes = (
  attributes: Record<string, MessageAttributeValue> | undefined,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(attributes ?? {}).flatMap(([name, { StringValue }]) =>
      StringValue === undefined ? [] : [[name, StringValue]],
    ),
  );

const toIncomingMessage = (message: Message): IncomingMessage => ({
  id: message.MessageId ?? '',
  receiptHandle: message.ReceiptHandle ?? '',
  body: message.Body ?? '',
  attributes: toStringAttributes(message.MessageAttributes),
});

export class SqsChargeQueue implements ChargeQueue {
  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
  ) {}

  async receive(signal: AbortSignal, maxMessages: number): Promise<IncomingMessage[]> {
    const output = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: LONG_POLL_SECONDS,
        MessageAttributeNames: ['All'],
      }),
      { abortSignal: signal },
    );
    return (output.Messages ?? []).map(toIncomingMessage);
  }

  async deleteBatch(receiptHandles: readonly string[]): Promise<void> {
    if (receiptHandles.length === 0) return;
    const output = await this.client.send(
      new DeleteMessageBatchCommand({
        QueueUrl: this.queueUrl,
        Entries: receiptHandles.map((receiptHandle, index) => ({
          Id: String(index),
          ReceiptHandle: receiptHandle,
        })),
      }),
    );
    if (output.Failed?.length) {
      throw new Error(`failed to delete ${output.Failed.length} message(s)`);
    }
  }
}
