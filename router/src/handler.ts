import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda';
import type { Logger } from './logging/logger.js';
import type { OutgoingMessage, QueueSender } from './queue/queue-sender.js';
import type { QueueTarget, RouteTarget, RoutingDecision } from './routing/decide-route.js';
import { parseRoutableMessage } from './routing/parse-routable-message.js';
import type { RoutableMessage } from './routing/routable-message.js';
import type { RoutePlanner } from './routing/route-planner.js';
import type { RoutingConfig, RoutingConfigResolver } from './routing/routing-config.js';

const SEND_BATCH_LIMIT = 10;

export type HandlerDependencies = {
  configResolver: RoutingConfigResolver;
  planner: RoutePlanner;
  sender: QueueSender;
  queueUrls: Record<QueueTarget, string>;
  logger: Logger;
};

type Dispatch = {
  record: SQSRecord;
  message: RoutableMessage;
  decision: RoutingDecision;
  target: RouteTarget;
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
  target: RouteTarget,
): OutgoingMessage => ({
  id: String(index),
  body: record.body,
  attributes: {
    messageId: message.messageId,
    chargeId: message.chargeId,
    routingMode: decision.mode,
    ...(target.role === 'shadow' && { shadow: 'true' }),
  },
});

const toBatchResponse = (records: readonly SQSRecord[]): SQSBatchResponse => ({
  batchItemFailures: records.map((record) => ({ itemIdentifier: record.messageId })),
});

export const createHandler = ({ configResolver, planner, sender, queueUrls, logger }: HandlerDependencies) => {
  const planRecord = async (
    record: SQSRecord,
    index: number,
    config: RoutingConfig,
  ): Promise<Dispatch[] | undefined> => {
    const message = parseRoutableMessage(record.body);
    if (!message) {
      logger.error({ event: 'invalid_message', sqsMessageId: record.messageId });
      return undefined;
    }
    try {
      const decision = await planner.plan(message, config);
      return decision.targets.map((target) => ({
        record,
        message,
        decision,
        target,
        outgoing: toOutgoing(index, record, message, decision, target),
      }));
    } catch (error) {
      logger.error({ event: 'routing_failed', ...message, error: errorText(error) });
      return undefined;
    }
  };

  const logRouted = ({ message, decision, target }: Dispatch): void =>
    logger.info({
      event: 'routed',
      ...message,
      mode: decision.mode,
      destination: target.queue,
      role: target.role,
    });

  const logShadowFailure = ({ message, target }: Dispatch): void =>
    logger.error({ event: 'shadow_send_failed', ...message, destination: target.queue });

  const isShadow = ({ target }: Dispatch): boolean => target.role === 'shadow';

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
      logger.error({
        event: 'send_failed',
        destination: target,
        affectedRecords: dispatches.length,
        error: errorText(error),
      });
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
    Map.groupBy(dispatches, ({ target }) => target.queue);

  return async (event: SQSEvent): Promise<SQSBatchResponse> => {
    let config: RoutingConfig;
    try {
      const resolution = await configResolver.resolve();
      config = resolution.config;
      if (resolution.fallbackReason !== undefined) {
        logger.error({
          event: 'config_invalid_using_last_valid',
          error: resolution.fallbackReason,
          affectedRecords: event.Records.length,
        });
      }
    } catch (error) {
      logger.error({
        event: 'config_failed',
        error: errorText(error),
        affectedRecords: event.Records.length,
      });
      return toBatchResponse(event.Records);
    }

    const plans = await Promise.all(
      event.Records.map(async (record, index) => ({
        record,
        dispatches: await planRecord(record, index, config),
      })),
    );
    const unroutable = plans.filter(({ dispatches }) => !dispatches).map(({ record }) => record);
    const dispatches = plans.flatMap(({ dispatches }) => dispatches ?? []);

    const failedPerTarget = await Promise.all(
      [...groupByTarget(dispatches)].map(([target, group]) => sendToTarget(target, group)),
    );
    const failed = failedPerTarget.flat();
    failed.filter(isShadow).forEach(logShadowFailure);
    const failedRecords = failed.filter((dispatch) => !isShadow(dispatch)).map(({ record }) => record);

    return toBatchResponse([...new Set([...unroutable, ...failedRecords])]);
  };
};
