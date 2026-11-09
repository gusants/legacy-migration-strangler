import type { ChargeMessage } from '../application/charge-message.js';
import type { ChargeResult } from '../application/charge-result.js';
import { chargeMessageSchema } from '../http/charge-message.schema.js';
import type { Logger } from '../../logging/logger.js';
import type { IncomingMessage } from './charge-queue.js';

export type MessageOutcome = 'processed' | 'invalid' | 'failed';

export type ChargeProcessor = {
  execute(message: ChargeMessage): Promise<ChargeResult>;
};

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

export const createIncomingMessageHandler =
  (processor: ChargeProcessor, logger: Logger): IncomingMessageHandler =>
  async (incoming) => {
    const charge = parseCharge(incoming.body);
    if (!charge) {
      logger.error({ event: 'invalid_message', sqsMessageId: incoming.id });
      return 'invalid';
    }
    const context = { sqsMessageId: incoming.id, messageId: charge.messageId, chargeId: charge.chargeId };
    try {
      const result = await processor.execute(charge);
      logger.info({ event: 'message_processed', ...context, status: result.status });
      return 'processed';
    } catch (error) {
      logger.error({ event: 'message_failed', ...context, error: errorText(error) });
      return 'failed';
    }
  };
