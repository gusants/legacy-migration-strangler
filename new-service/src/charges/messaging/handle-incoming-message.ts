import type { ChargeMessage } from '../application/charge-message.js';
import type { ChargeResult } from '../application/charge-result.js';
import { chargeMessageSchema } from '../http/charge-message.schema.js';
import type { Logger } from '../../logging/logger.js';
import type { IncomingMessage } from './charge-queue.js';
import { resolveDestination, type ResultsDestination } from './results-destination.js';

export type MessageOutcome = 'processed' | 'invalid' | 'failed';

export type ChargeProcessor = {
  execute(message: ChargeMessage): Promise<ChargeResult>;
};

export type ChargeProcessors = Record<ResultsDestination, ChargeProcessor>;

export type IncomingMessageHandler = (incoming: IncomingMessage) => Promise<MessageOutcome>;

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const parseCharge = (body: string): ChargeMessage | undefined => {
  try {
    const parsed = chargeMessageSchema.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

export const createIncomingMessageHandler = (processors: ChargeProcessors, logger: Logger): IncomingMessageHandler => {
  const reportInvalid = (incoming: IncomingMessage, reason: string): MessageOutcome => {
    logger.error({ event: 'invalid_message', sqsMessageId: incoming.id, reason });
    return 'invalid';
  };

  return async (incoming) => {
    const charge = parseCharge(incoming.body);
    if (!charge) return reportInvalid(incoming, 'body is not a valid charge');
    const resolution = resolveDestination(incoming.attributes);
    if ('invalidReason' in resolution) return reportInvalid(incoming, resolution.invalidReason);
    const { destination } = resolution;
    const context = {
      sqsMessageId: incoming.id,
      messageId: charge.messageId,
      chargeId: charge.chargeId,
      shadow: destination === 'shadow',
    };
    try {
      const result = await processors[destination].execute(charge);
      logger.info({ event: 'message_processed', ...context, status: result.status });
      return 'processed';
    } catch (error) {
      logger.error({ event: 'message_failed', ...context, error: errorText(error) });
      return 'failed';
    }
  };
};
