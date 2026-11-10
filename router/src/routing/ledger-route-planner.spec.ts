import type { RoutingDecision } from './decide-route.js';
import { createLedgerRoutePlanner, LEDGER_PINNED_REASON } from './ledger-route-planner.js';
import type { RoutePlanner } from './route-planner.js';
import type { RoutingConfig, RoutingMode } from './routing-config.js';
import { MissingPrimaryTargetError } from './routing-errors.js';
import type { RoutingLedger } from './routing-ledger.js';
import type { QueueTarget } from './decide-route.js';

const message = { messageId: 'm1', chargeId: 'c1' };
const config: RoutingConfig = { mode: 'legacy' };

type Claim = { messageId: string; service: QueueTarget; routingMode: RoutingMode };

const buildPlanner = (decision: RoutingDecision, recordedService?: QueueTarget) => {
  const claims: Claim[] = [];
  const ledger: RoutingLedger = {
    claim: async (messageId, service, routingMode) => {
      claims.push({ messageId, service, routingMode });
      return recordedService ?? service;
    },
  };
  const inner: RoutePlanner = { plan: async () => decision };
  return { planner: createLedgerRoutePlanner(inner, ledger), claims };
};

const legacyOnly: RoutingDecision = { mode: 'percentage', targets: [{ queue: 'legacy', role: 'primary' }] };
const newOnly: RoutingDecision = { mode: 'percentage', targets: [{ queue: 'new', role: 'primary' }] };
const legacyWithShadow: RoutingDecision = {
  mode: 'percentage',
  targets: [
    { queue: 'legacy', role: 'primary' },
    { queue: 'new', role: 'shadow' },
  ],
};

describe('ledger route planner', () => {
  it('claims the primary target under the decision mode and keeps the decision when the ledger agrees', async () => {
    const { planner, claims } = buildPlanner(legacyWithShadow);

    await expect(planner.plan(message, config)).resolves.toBe(legacyWithShadow);
    expect(claims).toEqual([{ messageId: 'm1', service: 'legacy', routingMode: 'percentage' }]);
  });

  it('claims even in legacy-only decisions', async () => {
    const { planner, claims } = buildPlanner({ mode: 'legacy', targets: [{ queue: 'legacy', role: 'primary' }] });

    await planner.plan(message, config);

    expect(claims).toEqual([{ messageId: 'm1', service: 'legacy', routingMode: 'legacy' }]);
  });

  it('sends a redelivered message to the recorded service when the new decision picks another one', async () => {
    const { planner } = buildPlanner(newOnly, 'legacy');

    await expect(planner.plan(message, config)).resolves.toEqual({
      mode: 'percentage',
      targets: [{ queue: 'legacy', role: 'primary' }],
      reason: LEDGER_PINNED_REASON,
    });
  });

  it('drops a shadow copy that would duplicate the recorded primary queue', async () => {
    const { planner } = buildPlanner(legacyWithShadow, 'new');

    await expect(planner.plan(message, config)).resolves.toEqual({
      mode: 'percentage',
      targets: [{ queue: 'new', role: 'primary' }],
      reason: LEDGER_PINNED_REASON,
    });
  });

  it('keeps a shadow copy on the other service when the primary is pinned', async () => {
    const decision: RoutingDecision = {
      mode: 'percentage',
      targets: [
        { queue: 'new', role: 'primary' },
        { queue: 'legacy', role: 'shadow' },
      ],
    };
    const { planner } = buildPlanner(decision, 'legacy');

    const pinned = await planner.plan(message, config);

    expect(pinned.targets).toEqual([{ queue: 'legacy', role: 'primary' }]);
  });

  it('fails when the ledger fails, so nothing is sent without a record', async () => {
    const ledger: RoutingLedger = {
      claim: async () => {
        throw new Error('ledger down');
      },
    };
    const planner = createLedgerRoutePlanner({ plan: async () => legacyOnly }, ledger);

    await expect(planner.plan(message, config)).rejects.toThrow('ledger down');
  });

  it('fails without touching the ledger when the decision has no primary target', async () => {
    const claim = vi.fn<RoutingLedger['claim']>();
    const planner = createLedgerRoutePlanner(
      { plan: async () => ({ mode: 'shadow', targets: [{ queue: 'new', role: 'shadow' }] }) },
      { claim },
    );

    await expect(planner.plan(message, config)).rejects.toThrow(MissingPrimaryTargetError);
    expect(claim).not.toHaveBeenCalled();
  });
});
