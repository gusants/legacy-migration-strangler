import type { QueueTarget } from '../routing/decide-route.js';
import { parseRoutableMessage } from '../routing/parse-routable-message.js';

export type RecordedServiceLookup = (messageId: string) => Promise<QueueTarget | undefined>;

export const messageIdsPinnedToLegacy = async (
  bodies: readonly string[],
  recordedServiceOf: RecordedServiceLookup,
): Promise<string[]> => {
  const messageIds = bodies.flatMap((body) => {
    const message = parseRoutableMessage(body);
    return message ? [message.messageId] : [];
  });
  const services = await Promise.all(messageIds.map(recordedServiceOf));
  return messageIds.filter((_messageId, index) => services[index] === 'legacy');
};
