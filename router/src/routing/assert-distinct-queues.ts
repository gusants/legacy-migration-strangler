import type { RoutingDecision } from './decide-route.js';
import { DuplicateRouteQueueError } from './routing-errors.js';

export const assertDistinctQueues = (decision: RoutingDecision): RoutingDecision => {
  const seen = new Set<string>();
  for (const { queue } of decision.targets) {
    if (seen.has(queue)) throw new DuplicateRouteQueueError(queue);
    seen.add(queue);
  }
  return decision;
};
