import { Pool } from 'pg';
import { createSqsClient } from './config/create-sqs-client.js';
import { loadHandlerEnv } from './config/env.js';
import { createHandler } from './handler.js';
import { PostgresRoutingLedger } from './ledger/postgres-routing-ledger.js';
import { jsonLogger } from './logging/logger.js';
import { SqsQueueSender } from './queue/sqs-queue-sender.js';
import { FileRoutingConfigProvider } from './routing/file-routing-config-provider.js';
import { LastValidRoutingConfigResolver } from './routing/last-valid-routing-config-resolver.js';
import { createLedgerRoutePlanner } from './routing/ledger-route-planner.js';
import { pureRoutePlanner } from './routing/pure-route-planner.js';

const env = loadHandlerEnv(process.env);
const ledger = new PostgresRoutingLedger(new Pool({ connectionString: env.ledgerDatabaseUrl }));
await ledger.ensureSchema();

export const handler = createHandler({
  configResolver: new LastValidRoutingConfigResolver(new FileRoutingConfigProvider(env.routingConfigPath)),
  planner: createLedgerRoutePlanner(pureRoutePlanner, ledger),
  sender: new SqsQueueSender(createSqsClient(env)),
  queueUrls: env.queueUrls,
  logger: jsonLogger,
});
