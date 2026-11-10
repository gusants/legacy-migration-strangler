import {
  ChangeMessageVisibilityBatchCommand,
  ReceiveMessageCommand,
  type Message,
  type SQSClient,
} from '@aws-sdk/client-sqs';

const MAX_MESSAGES_PER_RECEIVE = 10;
const RECEIVE_WAIT_SECONDS = 1;
const HOLD_SECONDS_WHILE_PEEKING = 60;

const receiveBatch = async (client: SQSClient, queueUrl: string): Promise<Message[]> => {
  const { Messages } = await client.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: MAX_MESSAGES_PER_RECEIVE,
      WaitTimeSeconds: RECEIVE_WAIT_SECONDS,
      VisibilityTimeout: HOLD_SECONDS_WHILE_PEEKING,
    }),
  );
  return Messages ?? [];
};

const makeVisibleAgain = async (client: SQSClient, queueUrl: string, messages: readonly Message[]): Promise<void> => {
  for (let start = 0; start < messages.length; start += MAX_MESSAGES_PER_RECEIVE) {
    const batch = messages.slice(start, start + MAX_MESSAGES_PER_RECEIVE);
    await client.send(
      new ChangeMessageVisibilityBatchCommand({
        QueueUrl: queueUrl,
        Entries: batch.map(({ ReceiptHandle }, index) => ({ Id: String(index), ReceiptHandle, VisibilityTimeout: 0 })),
      }),
    );
  }
};

export const peekQueueBodies = async (client: SQSClient, queueUrl: string): Promise<string[]> => {
  const held: Message[] = [];
  try {
    for (let batch = await receiveBatch(client, queueUrl); batch.length > 0; batch = await receiveBatch(client, queueUrl)) {
      held.push(...batch);
    }
  } finally {
    await makeVisibleAgain(client, queueUrl, held);
  }
  return held.map(({ Body }) => Body ?? '');
};
