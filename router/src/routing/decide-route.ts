import type { RoutableMessage } from './routable-message.js';
import type { RoutingConfig, RoutingMode } from './routing-config.js';
import { UnsupportedRoutingModeError } from './routing-errors.js';
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

type PercentageConfig = Extract<RoutingConfig, { mode: 'percentage' }>;

const primaryOn = (queue: QueueTarget): readonly RouteTarget[] => [{ queue, role: 'primary' }];

const exceedsNewServiceLimit = ({ amountCents }: RoutableMessage): boolean =>
  amountCents !== undefined && amountCents > NEW_SERVICE_MAX_AMOUNT_CENTS;

const decidePercentage = (message: RoutableMessage, { newTrafficPercent }: PercentageConfig): RoutingDecision => {
  if (exceedsNewServiceLimit(message)) {
    return { mode: 'percentage', targets: primaryOn('legacy'), reason: AMOUNT_ABOVE_NEW_SERVICE_LIMIT };
  }
  const inNewSlice = trafficBucketOf(message.chargeId) < newTrafficPercent;
  return { mode: 'percentage', targets: primaryOn(inNewSlice ? 'new' : 'legacy') };
};

export const decideRoute = (message: RoutableMessage, config: RoutingConfig): RoutingDecision => {
  switch (config.mode) {
    case 'legacy':
      return { mode: 'legacy', targets: primaryOn('legacy') };
    case 'shadow':
      return {
        mode: 'shadow',
        targets: [...primaryOn('legacy'), { queue: 'new', role: 'shadow' }],
      };
    case 'percentage':
      return decidePercentage(message, config);
    case 'new':
      throw new UnsupportedRoutingModeError(config.mode);
  }
};
