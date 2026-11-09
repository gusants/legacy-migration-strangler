import { createSqsClient } from './config/create-sqs-client.js';
import { loadRouterEnv } from './config/env.js';
import { createHandler } from './handler.js';
import { jsonLogger } from './logging/logger.js';
import { SqsQueueSender } from './queue/sqs-queue-sender.js';
import { FileRoutingConfigProvider } from './routing/file-routing-config-provider.js';
import { pureRoutePlanner } from './routing/pure-route-planner.js';

const env = loadRouterEnv(process.env);

export const handler = createHandler({
  configProvider: new FileRoutingConfigProvider(env.routingConfigPath),
  planner: pureRoutePlanner,
  sender: new SqsQueueSender(createSqsClient(env)),
  queueUrls: env.queueUrls,
  logger: jsonLogger,
});
