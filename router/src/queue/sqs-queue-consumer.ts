import {
  DeleteMessageBatchCommand,
  ReceiveMessageCommand,
  type Message,
  type SQSClient,
} from '@aws-sdk/client-sqs';
import type { QueueConsumer, ReceiveOptions, ReceivedMessage } from './queue-consumer.js';

const toReceivedMessage = (message: Message): ReceivedMessage => ({
  messageId: message.MessageId ?? '',
  receiptHandle: message.ReceiptHandle ?? '',
  body: message.Body ?? '',
  md5OfBody: message.MD5OfBody ?? '',
  attributes: { ...message.Attributes },
});

export class SqsQueueConsumer implements QueueConsumer {
  constructor(private readonly client: SQSClient) {}

  async receive(queueUrl: string, options: ReceiveOptions): Promise<ReceivedMessage[]> {
    const output = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: options.maxMessages,
        WaitTimeSeconds: options.waitTimeSeconds,
        MessageSystemAttributeNames: ['All'],
      }),
      { abortSignal: options.signal },
    );
    return (output.Messages ?? []).map(toReceivedMessage);
  }

  async deleteBatch(queueUrl: string, receiptHandles: readonly string[]): Promise<void> {
    if (receiptHandles.length === 0) return;
    const output = await this.client.send(
      new DeleteMessageBatchCommand({
        QueueUrl: queueUrl,
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
