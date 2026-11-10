import type { RoutableMessage } from './routable-message.js';
import type { RoutingConfig, RoutingMode } from './routing-config.js';
import { isStorableText } from './storable-text.js';
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

export const IDENTIFIER_NOT_STORABLE_BY_NEW_SERVICE = 'identifier_not_storable_by_new_service';

export const IDENTIFIER_NOT_STORABLE_BY_NEW_SERVICE_WILL_DEAD_LETTER =
  'identifier_not_storable_by_new_service_will_dead_letter';

type PercentageConfig = Extract<RoutingConfig, { mode: 'percentage' }>;

const SHADOW_ON_NEW: RouteTarget = { queue: 'new', role: 'shadow' };

const primaryOn = (queue: QueueTarget): readonly RouteTarget[] => [{ queue, role: 'primary' }];

const exceedsNewServiceLimit = ({ amountCents }: RoutableMessage): boolean =>
  amountCents !== undefined && amountCents > NEW_SERVICE_MAX_AMOUNT_CENTS;

const hasIdentifierNewServiceCannotStore = ({ messageId, chargeId }: RoutableMessage): boolean =>
  !isStorableText(messageId) || !isStorableText(chargeId);

const keptOnLegacyReason = (message: RoutableMessage): string | undefined => {
  if (exceedsNewServiceLimit(message)) return AMOUNT_ABOVE_NEW_SERVICE_LIMIT;
  if (hasIdentifierNewServiceCannotStore(message)) return IDENTIFIER_NOT_STORABLE_BY_NEW_SERVICE;
  return undefined;
};

const deadLetterReason = (message: RoutableMessage): string | undefined => {
  if (exceedsNewServiceLimit(message)) return AMOUNT_ABOVE_NEW_SERVICE_LIMIT_WILL_DEAD_LETTER;
  if (hasIdentifierNewServiceCannotStore(message)) return IDENTIFIER_NOT_STORABLE_BY_NEW_SERVICE_WILL_DEAD_LETTER;
  return undefined;
};

const decidePercentage = (message: RoutableMessage, { newTrafficPercent }: PercentageConfig): RoutingDecision => {
  const reason = keptOnLegacyReason(message);
  if (reason) {
    return { mode: 'percentage', targets: primaryOn('legacy'), reason };
  }
  if (trafficBucketOf(message.chargeId) < newTrafficPercent) {
    return { mode: 'percentage', targets: primaryOn('new') };
  }
  return { mode: 'percentage', targets: [...primaryOn('legacy'), SHADOW_ON_NEW] };
};

const decideNew = (message: RoutableMessage): RoutingDecision => {
  const reason = deadLetterReason(message);
  return { mode: 'new', targets: primaryOn('new'), ...(reason ? { reason } : {}) };
};

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
