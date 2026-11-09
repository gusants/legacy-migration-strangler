import type { ChargeMessage } from './charge-message.js';
import type { ChargeResult } from './charge-result.js';

export abstract class ChargeResultsRepository {
  abstract findByMessageId(messageId: string): Promise<ChargeResult | null>;
  abstract saveIfAbsent(message: ChargeMessage, result: ChargeResult): Promise<ChargeResult>;
}
