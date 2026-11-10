import type { QueueTarget } from './decide-route.js';
import type { RoutingMode } from './routing-config.js';

export type RoutingLedger = {
  claim(messageId: string, service: QueueTarget, routingMode: RoutingMode): Promise<QueueTarget>;
};
