import { createSqsClient } from './config/create-sqs-client.js';
import { loadRouterEnv } from './config/env.js';
import { createHandler } from './handler.js';
import { jsonLogger } from './logging/logger.js';
import { SqsQueueConsumer } from './queue/sqs-queue-consumer.js';
import { SqsQueueSender } from './queue/sqs-queue-sender.js';
import { FileRoutingConfigProvider } from './routing/file-routing-config-provider.js';
import { LastValidRoutingConfigResolver } from './routing/last-valid-routing-config-resolver.js';
import { pureRoutePlanner } from './routing/pure-route-planner.js';
import { runUntilAborted } from './runner/poll-and-route.js';

const main = async (): Promise<void> => {
  const env = loadRouterEnv(process.env);
  const client = createSqsClient(env);
  const shutdown = new AbortController();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      jsonLogger.info({ event: 'shutdown_requested', signal });
      shutdown.abort();
    });
  }

  jsonLogger.info({ event: 'runner_started', queue: env.incomingQueueUrl });
  await runUntilAborted(
    {
      consumer: new SqsQueueConsumer(client),
      handler: createHandler({
        configResolver: new LastValidRoutingConfigResolver(new FileRoutingConfigProvider(env.routingConfigPath)),
        planner: pureRoutePlanner,
        sender: new SqsQueueSender(client),
        queueUrls: env.queueUrls,
        logger: jsonLogger,
      }),
      logger: jsonLogger,
      queueUrl: env.incomingQueueUrl,
      queueArn: `arn:aws:sqs:${env.region}:000000000000:${env.incomingQueueUrl.split('/').pop()}`,
      region: env.region,
    },
    shutdown.signal,
  );
  jsonLogger.info({ event: 'runner_stopped' });
};

main().catch((error: unknown) => {
  jsonLogger.error({ event: 'runner_crashed', error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
