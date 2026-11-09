import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda';
import type { Logger } from './logging/logger.js';
import type { OutgoingMessage, QueueSender } from './queue/queue-sender.js';
import { decideRoute, type QueueTarget, type RoutingDecision } from './routing/decide-route.js';
import { parseRoutableMessage } from './routing/parse-routable-message.js';
import type { RoutableMessage } from './routing/routable-message.js';
import type { RoutingConfig, RoutingConfigProvider } from './routing/routing-config.js';

const SEND_BATCH_LIMIT = 10;

export type HandlerDependencies = {
  configProvider: RoutingConfigProvider;
  sender: QueueSender;
  queueUrls: Record<QueueTarget, string>;
  logger: Logger;
};

type Dispatch = {
  record: SQSRecord;
  message: RoutableMessage;
  decision: RoutingDecision;
  target: QueueTarget;
  outgoing: OutgoingMessage;
};

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const chunk = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

const toOutgoing = (
  index: number,
  record: SQSRecord,
  message: RoutableMessage,
  decision: RoutingDecision,
): OutgoingMessage => ({
  id: String(index),
  body: record.body,
  attributes: {
    messageId: message.messageId,
    chargeId: message.chargeId,
    routingMode: decision.mode,
  },
});

const toBatchResponse = (records: readonly SQSRecord[]): SQSBatchResponse => ({
  batchItemFailures: records.map((record) => ({ itemIdentifier: record.messageId })),
});

export const createHandler = ({ configProvider, sender, queueUrls, logger }: HandlerDependencies) => {
  const planRecord = (
    record: SQSRecord,
    index: number,
    config: RoutingConfig,
  ): Dispatch[] | undefined => {
    const message = parseRoutableMessage(record.body);
    if (!message) {
      logger.error({ event: 'invalid_message', sqsMessageId: record.messageId });
      return undefined;
    }
    try {
      const decision = decideRoute(message, config);
      return decision.targets.map((target) => ({
        record,
        message,
        decision,
        target,
        outgoing: toOutgoing(index, record, message, decision),
      }));
    } catch (error) {
      logger.error({ event: 'routing_failed', ...message, error: errorText(error) });
      return undefined;
    }
  };

  const logRouted = ({ message, decision, target }: Dispatch): void =>
    logger.info({ event: 'routed', ...message, mode: decision.mode, destination: target });

  const sendChunk = async (target: QueueTarget, dispatches: Dispatch[]): Promise<Dispatch[]> => {
    try {
      const { failedIds } = await sender.sendBatch(
        queueUrls[target],
        dispatches.map(({ outgoing }) => outgoing),
      );
      const failed = dispatches.filter(({ outgoing }) => failedIds.includes(outgoing.id));
      dispatches.filter((dispatch) => !failed.includes(dispatch)).forEach(logRouted);
      return failed;
    } catch (error) {
      logger.error({ event: 'send_failed', destination: target, error: errorText(error) });
      return dispatches;
    }
  };

  const sendToTarget = async (target: QueueTarget, dispatches: Dispatch[]): Promise<Dispatch[]> => {
    const failedPerChunk = await Promise.all(
      chunk(dispatches, SEND_BATCH_LIMIT).map((part) => sendChunk(target, part)),
    );
    return failedPerChunk.flat();
  };

  const groupByTarget = (dispatches: Dispatch[]): Map<QueueTarget, Dispatch[]> =>
    Map.groupBy(dispatches, ({ target }) => target);

  return async (event: SQSEvent): Promise<SQSBatchResponse> => {
    let config: RoutingConfig;
    try {
      config = await configProvider.load();
    } catch (error) {
      logger.error({ event: 'config_failed', error: errorText(error) });
      return toBatchResponse(event.Records);
    }

    const plans = event.Records.map((record, index) => ({
      record,
      dispatches: planRecord(record, index, config),
    }));
    const unroutable = plans.filter(({ dispatches }) => !dispatches).map(({ record }) => record);
    const dispatches = plans.flatMap(({ dispatches }) => dispatches ?? []);

    const failedPerTarget = await Promise.all(
      [...groupByTarget(dispatches)].map(([target, group]) => sendToTarget(target, group)),
    );
    const failedRecords = failedPerTarget.flat().map(({ record }) => record);

    return toBatchResponse([...new Set([...unroutable, ...failedRecords])]);
  };
};
