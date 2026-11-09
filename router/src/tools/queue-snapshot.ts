import { GetQueueAttributesCommand, type SQSClient } from '@aws-sdk/client-sqs';
import type { RunnerEnv } from '../config/env.js';
import type { QueueSnapshot } from './flow-verdict.js';

const DEAD_LETTER_SUFFIX = '-dlq';

const countMessages = async (client: SQSClient, queueUrl: string): Promise<number> => {
  const { Attributes } = await client.send(
    new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible', 'ApproximateNumberOfMessagesDelayed'],
    }),
  );
  return Object.values(Attributes ?? {}).reduce((total, value) => total + Number(value), 0);
};

export const takeQueueSnapshot = async (client: SQSClient, env: RunnerEnv): Promise<QueueSnapshot> => {
  const [incomingDlq, legacyDlq, incomingPending] = await Promise.all([
    countMessages(client, `${env.incomingQueueUrl}${DEAD_LETTER_SUFFIX}`),
    countMessages(client, `${env.queueUrls.legacy}${DEAD_LETTER_SUFFIX}`),
    countMessages(client, env.incomingQueueUrl),
  ]);
  return { incomingDlq, legacyDlq, incomingPending };
};
