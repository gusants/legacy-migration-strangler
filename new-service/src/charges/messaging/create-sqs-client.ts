import { SQSClient } from '@aws-sdk/client-sqs';
import type { SqsConsumerSettings } from '../../config/env.js';

const CONNECTION_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 30_000;

export const createSqsClient = ({ endpoint, region }: SqsConsumerSettings): SQSClient =>
  new SQSClient({
    region,
    ...(endpoint && { endpoint }),
    requestHandler: {
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      requestTimeout: REQUEST_TIMEOUT_MS,
    },
  });
