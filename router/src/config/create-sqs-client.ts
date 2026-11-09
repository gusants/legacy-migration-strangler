import { SQSClient } from '@aws-sdk/client-sqs';
import type { RouterEnv } from './env.js';

export const createSqsClient = ({ endpoint, region }: RouterEnv): SQSClient =>
  new SQSClient({ region, ...(endpoint && { endpoint }) });
