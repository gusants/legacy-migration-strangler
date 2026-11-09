import {
  SendMessageBatchCommand,
  type BatchResultErrorEntry,
  type SQSClient,
} from '@aws-sdk/client-sqs';
import type { OutgoingMessage, QueueSender, SendBatchResult, SendFailure } from './queue-sender.js';

const toStringAttributes = (attributes: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(attributes).map(([name, value]) => [
      name,
      { DataType: 'String', StringValue: value },
    ]),
  );

const MISSING_RESULT_CODE = 'MissingBatchResult';

const toFailure = (id: string, reported: BatchResultErrorEntry | undefined): SendFailure => ({
  id,
  code: reported?.Code ?? MISSING_RESULT_CODE,
  senderFault: reported?.SenderFault ?? false,
});

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
    const succeededIds = new Set((output.Successful ?? []).map(({ Id }) => Id));
    const reportedById = new Map((output.Failed ?? []).map((entry) => [entry.Id, entry]));
    return {
      failures: messages
        .filter(({ id }) => !succeededIds.has(id))
        .map(({ id }) => toFailure(id, reportedById.get(id))),
    };
  }
}
