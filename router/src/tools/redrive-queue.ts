import {
  DeleteMessageBatchCommand,
  ReceiveMessageCommand,
  type Message,
  type SQSClient,
} from '@aws-sdk/client-sqs';
import { SqsQueueSender } from '../queue/sqs-queue-sender.js';
import type { OutgoingMessage } from '../queue/queue-sender.js';

const MAX_MESSAGES_PER_RECEIVE = 10;
const RECEIVE_WAIT_SECONDS = 1;

export type RedriveResult = { moved: number; failed: number };

const stringAttributesOf = ({ MessageAttributes }: Message): Record<string, string> =>
  Object.fromEntries(
    Object.entries(MessageAttributes ?? {}).flatMap(([name, { StringValue }]) =>
      StringValue === undefined ? [] : [[name, StringValue]],
    ),
  );

const toOutgoing = (message: Message, index: number): OutgoingMessage => ({
  id: String(index),
  body: message.Body ?? '',
  attributes: stringAttributesOf(message),
});

const receiveBatch = async (client: SQSClient, sourceUrl: string): Promise<Message[]> => {
  const { Messages } = await client.send(
    new ReceiveMessageCommand({
      QueueUrl: sourceUrl,
      MaxNumberOfMessages: MAX_MESSAGES_PER_RECEIVE,
      WaitTimeSeconds: RECEIVE_WAIT_SECONDS,
      MessageAttributeNames: ['All'],
    }),
  );
  return Messages ?? [];
};

const deleteAll = async (client: SQSClient, sourceUrl: string, messages: readonly Message[]): Promise<void> => {
  if (messages.length === 0) return;
  await client.send(
    new DeleteMessageBatchCommand({
      QueueUrl: sourceUrl,
      Entries: messages.map(({ ReceiptHandle }, index) => ({ Id: String(index), ReceiptHandle })),
    }),
  );
};

export const redriveQueue = async (
  client: SQSClient,
  sourceUrl: string,
  destinationUrl: string,
): Promise<RedriveResult> => {
  const sender = new SqsQueueSender(client);
  const result = { moved: 0, failed: 0 };
  for (let batch = await receiveBatch(client, sourceUrl); batch.length > 0; batch = await receiveBatch(client, sourceUrl)) {
    const { failures } = await sender.sendBatch(destinationUrl, batch.map(toOutgoing));
    const failedIds = new Set(failures.map(({ id }) => id));
    const sent = batch.filter((_message, index) => !failedIds.has(String(index)));
    await deleteAll(client, sourceUrl, sent);
    result.moved += sent.length;
    result.failed += failures.length;
  }
  return result;
};
