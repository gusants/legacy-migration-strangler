import type { RoutableMessage } from './routable-message.js';
import type { RoutingDecision } from './decide-route.js';
import type { RoutingConfig } from './routing-config.js';

export type RoutePlanner = {
  plan(message: RoutableMessage, config: RoutingConfig): Promise<RoutingDecision>;
};
