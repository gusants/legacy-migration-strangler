import { z } from 'zod';

const LOCAL_ACCOUNT_ID = '000000000000';

const handlerEnvSchema = z.object({
  SQS_ENDPOINT: z.url().optional(),
  AWS_REGION: z.string().min(1).default('us-east-1'),
  LEGACY_QUEUE_URL: z.url().optional(),
  NEW_QUEUE_URL: z.url().optional(),
  ROUTING_CONFIG_PATH: z.string().min(1).default('config/routing.json'),
  ROUTING_LEDGER_DATABASE_URL: z.string().min(1),
});

const runnerEnvSchema = handlerEnvSchema.extend({
  INCOMING_QUEUE_URL: z.url().optional(),
});

export type HandlerEnv = {
  endpoint: string | undefined;
  region: string;
  routingConfigPath: string;
  ledgerDatabaseUrl: string;
  queueUrls: { legacy: string; new: string };
};

export type RunnerEnv = HandlerEnv & {
  incomingQueueUrl: string;
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

const toHandlerEnv = (env: z.infer<typeof handlerEnvSchema>): HandlerEnv => {
  const endpoint = env.SQS_ENDPOINT;
  return {
    endpoint,
    region: env.AWS_REGION,
    routingConfigPath: env.ROUTING_CONFIG_PATH,
    ledgerDatabaseUrl: env.ROUTING_LEDGER_DATABASE_URL,
    queueUrls: {
      legacy: resolveQueueUrl(env.LEGACY_QUEUE_URL, endpoint, 'charges-legacy', 'LEGACY_QUEUE_URL'),
      new: resolveQueueUrl(env.NEW_QUEUE_URL, endpoint, 'charges-new', 'NEW_QUEUE_URL'),
    },
  };
};

export const loadHandlerEnv = (raw: NodeJS.ProcessEnv): HandlerEnv =>
  toHandlerEnv(handlerEnvSchema.parse(raw));

export const loadRunnerEnv = (raw: NodeJS.ProcessEnv): RunnerEnv => {
  const env = runnerEnvSchema.parse(raw);
  return {
    ...toHandlerEnv(env),
    incomingQueueUrl: resolveQueueUrl(
      env.INCOMING_QUEUE_URL,
      env.SQS_ENDPOINT,
      'charges-incoming',
      'INCOMING_QUEUE_URL',
    ),
  };
};
