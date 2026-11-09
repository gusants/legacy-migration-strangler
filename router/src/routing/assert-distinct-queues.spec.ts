import { assertDistinctQueues } from './assert-distinct-queues.js';
import type { RoutingDecision } from './decide-route.js';

describe('assertDistinctQueues', () => {
  it('returns a plan whose targets are on different queues', () => {
    const decision: RoutingDecision = {
      mode: 'shadow',
      targets: [
        { queue: 'legacy', role: 'primary' },
        { queue: 'new', role: 'shadow' },
      ],
    };

    expect(assertDistinctQueues(decision)).toBe(decision);
  });

  it('rejects a plan with two targets on the same queue', () => {
    const decision: RoutingDecision = {
      mode: 'shadow',
      targets: [
        { queue: 'new', role: 'primary' },
        { queue: 'new', role: 'shadow' },
      ],
    };

    expect(() => assertDistinctQueues(decision)).toThrow('routing plan targets queue "new" more than once');
  });
});
