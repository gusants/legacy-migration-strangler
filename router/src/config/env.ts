import { z } from 'zod';

const LOCAL_ACCOUNT_ID = '000000000000';

const envSchema = z.object({
  SQS_ENDPOINT: z.url().optional(),
  AWS_REGION: z.string().min(1).default('us-east-1'),
  INCOMING_QUEUE_URL: z.url().optional(),
  LEGACY_QUEUE_URL: z.url().optional(),
  NEW_QUEUE_URL: z.url().optional(),
  ROUTING_CONFIG_PATH: z.string().min(1).default('config/routing.json'),
});

export type RouterEnv = {
  endpoint: string | undefined;
  region: string;
  routingConfigPath: string;
  incomingQueueUrl: string;
  queueUrls: { legacy: string; new: string };
};

const resolveQueueUrl = (
  explicit: string | undefined,
  endpoint: string | undefined,
  queueName: string,
  variable: string,
): string => {
  const url = explicit ?? (endpoint && `${endpoint}/${LOCAL_ACCOUNT_ID}/${queueName}`);
  if (!url) {
    throw new Error(`${variable} or SQS_ENDPOINT must be set`);
  }
  return url;
};

export const loadRouterEnv = (raw: NodeJS.ProcessEnv): RouterEnv => {
  const env = envSchema.parse(raw);
  const endpoint = env.SQS_ENDPOINT;
  return {
    endpoint,
    region: env.AWS_REGION,
    routingConfigPath: env.ROUTING_CONFIG_PATH,
    incomingQueueUrl: resolveQueueUrl(
      env.INCOMING_QUEUE_URL,
      endpoint,
      'charges-incoming',
      'INCOMING_QUEUE_URL',
    ),
    queueUrls: {
      legacy: resolveQueueUrl(env.LEGACY_QUEUE_URL, endpoint, 'charges-legacy', 'LEGACY_QUEUE_URL'),
      new: resolveQueueUrl(env.NEW_QUEUE_URL, endpoint, 'charges-new', 'NEW_QUEUE_URL'),
    },
  };
};
