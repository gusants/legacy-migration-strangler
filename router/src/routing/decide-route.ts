import type { RoutableMessage } from './routable-message.js';
import type { RoutingConfig, RoutingMode } from './routing-config.js';
import { UnsupportedRoutingModeError } from './routing-errors.js';

export type QueueTarget = 'legacy' | 'new';

export type TargetRole = 'primary' | 'shadow';

export type RouteTarget = {
  queue: QueueTarget;
  role: TargetRole;
};

export type RoutingDecision = {
  mode: RoutingMode;
  targets: readonly RouteTarget[];
};

export const decideRoute = (
  _message: RoutableMessage,
  config: RoutingConfig,
): RoutingDecision => {
  switch (config.mode) {
    case 'legacy':
      return { mode: 'legacy', targets: [{ queue: 'legacy', role: 'primary' }] };
    case 'shadow':
    case 'percentage':
    case 'new':
      throw new UnsupportedRoutingModeError(config.mode);
  }
};
