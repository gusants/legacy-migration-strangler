import { SendMessageBatchCommand, type SQSClient } from '@aws-sdk/client-sqs';
import type { OutgoingMessage, QueueSender, SendBatchResult } from './queue-sender.js';

const toStringAttributes = (attributes: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(attributes).map(([name, value]) => [
      name,
      { DataType: 'String', StringValue: value },
    ]),
  );

export class SqsQueueSender implements QueueSender {
  constructor(private readonly client: SQSClient) {}

  async sendBatch(
    queueUrl: string,
    messages: readonly OutgoingMessage[],
  ): Promise<SendBatchResult> {
    const output = await this.client.send(
      new SendMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: messages.map((message) => ({
          Id: message.id,
          MessageBody: message.body,
          MessageAttributes: toStringAttributes(message.attributes),
        })),
      }),
    );
    return { failedIds: (output.Failed ?? []).map((failure) => failure.Id ?? '') };
  }
}
