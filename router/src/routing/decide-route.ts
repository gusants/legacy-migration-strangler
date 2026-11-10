import type { RoutableMessage } from './routable-message.js';
import type { RoutingConfig, RoutingMode } from './routing-config.js';
import { trafficBucketOf } from './traffic-bucket.js';

export type QueueTarget = 'legacy' | 'new';

export type TargetRole = 'primary' | 'shadow';

export type RouteTarget = {
  queue: QueueTarget;
  role: TargetRole;
};

export type RoutingDecision = {
  mode: RoutingMode;
  targets: readonly RouteTarget[];
  reason?: string;
};

export const NEW_SERVICE_MAX_AMOUNT_CENTS = 1_000_000_000_000;

export const AMOUNT_ABOVE_NEW_SERVICE_LIMIT = 'amount_above_new_service_limit';

export const AMOUNT_ABOVE_NEW_SERVICE_LIMIT_WILL_DEAD_LETTER = 'amount_above_new_service_limit_will_dead_letter';

type PercentageConfig = Extract<RoutingConfig, { mode: 'percentage' }>;

const SHADOW_ON_NEW: RouteTarget = { queue: 'new', role: 'shadow' };

const primaryOn = (queue: QueueTarget): readonly RouteTarget[] => [{ queue, role: 'primary' }];

const exceedsNewServiceLimit = ({ amountCents }: RoutableMessage): boolean =>
  amountCents !== undefined && amountCents > NEW_SERVICE_MAX_AMOUNT_CENTS;

const decidePercentage = (message: RoutableMessage, { newTrafficPercent }: PercentageConfig): RoutingDecision => {
  if (exceedsNewServiceLimit(message)) {
    return { mode: 'percentage', targets: primaryOn('legacy'), reason: AMOUNT_ABOVE_NEW_SERVICE_LIMIT };
  }
  if (trafficBucketOf(message.chargeId) < newTrafficPercent) {
    return { mode: 'percentage', targets: primaryOn('new') };
  }
  return { mode: 'percentage', targets: [...primaryOn('legacy'), SHADOW_ON_NEW] };
};

const decideNew = (message: RoutableMessage): RoutingDecision => ({
  mode: 'new',
  targets: primaryOn('new'),
  ...(exceedsNewServiceLimit(message) ? { reason: AMOUNT_ABOVE_NEW_SERVICE_LIMIT_WILL_DEAD_LETTER } : {}),
});

export const decideRoute = (message: RoutableMessage, config: RoutingConfig): RoutingDecision => {
  switch (config.mode) {
    case 'legacy':
      return { mode: 'legacy', targets: primaryOn('legacy') };
    case 'shadow':
      return { mode: 'shadow', targets: [...primaryOn('legacy'), SHADOW_ON_NEW] };
    case 'percentage':
      return decidePercentage(message, config);
    case 'new':
      return decideNew(message);
  }
};
