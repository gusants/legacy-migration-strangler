import type { SQSEvent, SQSRecord } from 'aws-lambda';
import type { ReceivedMessage } from '../queue/queue-consumer.js';

const toRecord = (message: ReceivedMessage, queueArn: string, region: string): SQSRecord => ({
  messageId: message.messageId,
  receiptHandle: message.receiptHandle,
  body: message.body,
  attributes: message.attributes as unknown as SQSRecord['attributes'],
  messageAttributes: {},
  md5OfBody: message.md5OfBody,
  eventSource: 'aws:sqs',
  eventSourceARN: queueArn,
  awsRegion: region,
});

export const toSqsEvent = (
  messages: readonly ReceivedMessage[],
  queueArn: string,
  region: string,
): SQSEvent => ({ Records: messages.map((message) => toRecord(message, queueArn, region)) });
