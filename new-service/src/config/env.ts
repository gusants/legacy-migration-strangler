import { z } from 'zod';

const DEFAULT_REGION = 'us-east-1';

export const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.url(),
    SQS_CONSUMER_ENABLED: z.stringbool().default(false),
    SQS_ENDPOINT: z.url().optional(),
    NEW_QUEUE_URL: z.url().optional(),
    AWS_REGION: z.string().min(1).default(DEFAULT_REGION),
  })
  .refine((env) => !env.SQS_CONSUMER_ENABLED || env.NEW_QUEUE_URL !== undefined, {
    path: ['NEW_QUEUE_URL'],
    message: 'NEW_QUEUE_URL is required when SQS_CONSUMER_ENABLED is true',
  });

export type Env = z.infer<typeof envSchema>;

export type SqsConsumerSettings = {
  queueUrl: string;
  endpoint: string | undefined;
  region: string;
};

export const validateEnv = (raw: NodeJS.ProcessEnv): Env => envSchema.parse(raw);

export const sqsConsumerSettings = (env: Env): SqsConsumerSettings | undefined =>
  env.SQS_CONSUMER_ENABLED && env.NEW_QUEUE_URL
    ? { queueUrl: env.NEW_QUEUE_URL, endpoint: env.SQS_ENDPOINT, region: env.AWS_REGION }
    : undefined;
