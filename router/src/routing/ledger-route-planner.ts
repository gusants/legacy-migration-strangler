import type { QueueTarget, RouteTarget, RoutingDecision } from './decide-route.js';
import type { RoutePlanner } from './route-planner.js';
import { MissingPrimaryTargetError } from './routing-errors.js';
import type { RoutingLedger } from './routing-ledger.js';

export const LEDGER_PINNED_REASON = 'ledger_pinned_to_first_service';

const isPrimary = ({ role }: RouteTarget): boolean => role === 'primary';

const pinnedTo = (decision: RoutingDecision, service: QueueTarget): RoutingDecision => ({
  ...decision,
  targets: [
    { queue: service, role: 'primary' },
    ...decision.targets.filter(({ role, queue }) => role === 'shadow' && queue !== service),
  ],
  reason: LEDGER_PINNED_REASON,
});

export const createLedgerRoutePlanner = (inner: RoutePlanner, ledger: RoutingLedger): RoutePlanner => ({
  plan: async (message, config) => {
    const decision = await inner.plan(message, config);
    const primary = decision.targets.find(isPrimary);
    if (!primary) {
      throw new MissingPrimaryTargetError();
    }
    const recorded = await ledger.claim(message.messageId, primary.queue, decision.mode);
    return recorded === primary.queue ? decision : pinnedTo(decision, recorded);
  },
});
