import fc from 'fast-check';
import { decideRoute } from './decide-route.js';
import type { RoutingConfig } from './routing-config.js';
import { trafficBucketOf } from './traffic-bucket.js';

const FIXED_SEED = 20_261_110;

const message = { messageId: 'msg-1', chargeId: 'ch-1' };

describe('decideRoute', () => {
  it('sends everything to the legacy queue in legacy mode', () => {
    expect(decideRoute(message, { mode: 'legacy' })).toEqual({
      mode: 'legacy',
      targets: [{ queue: 'legacy', role: 'primary' }],
    });
  });

  it('keeps legacy as the primary and sends a shadow copy to the new queue in shadow mode', () => {
    expect(decideRoute(message, { mode: 'shadow' })).toEqual({
      mode: 'shadow',
      targets: [
        { queue: 'legacy', role: 'primary' },
        { queue: 'new', role: 'shadow' },
      ],
    });
  });

  describe('new mode', () => {
    it('sends everything to the new queue as the primary, with no shadow', () => {
      expect(decideRoute(message, { mode: 'new' })).toEqual({
        mode: 'new',
        targets: [{ queue: 'new', role: 'primary' }],
      });
    });

    it('still sends a charge above the new service limit there and says it will dead-letter', () => {
      expect(decideRoute({ ...message, amountCents: 1e12 + 1 }, { mode: 'new' })).toEqual({
        mode: 'new',
        targets: [{ queue: 'new', role: 'primary' }],
        reason: 'amount_above_new_service_limit_will_dead_letter',
      });
    });
  });

  describe.each([
    ['NUL', 'a\u0000b'],
    ['lone surrogate', 'a\uD800'],
  ])('an identifier with %s', (_label, badId) => {
    it.each([
      ['messageId', { messageId: badId, chargeId: 'ch-1' }],
      ['chargeId', { messageId: 'msg-1', chargeId: badId }],
    ])('in %s goes to the new queue in new mode and says it will dead-letter', (_field, bad) => {
      expect(decideRoute(bad, { mode: 'new' })).toEqual({
        mode: 'new',
        targets: [{ queue: 'new', role: 'primary' }],
        reason: 'identifier_not_storable_by_new_service_will_dead_letter',
      });
    });

    it.each([
      ['messageId', { messageId: badId, chargeId: 'ch-1' }],
      ['chargeId', { messageId: 'msg-1', chargeId: badId }],
    ])('in %s stays on legacy in percentage mode even at 100%, without a shadow copy', (_field, bad) => {
      expect(decideRoute(bad, { mode: 'percentage', newTrafficPercent: 100 })).toEqual({
        mode: 'percentage',
        targets: [{ queue: 'legacy', role: 'primary' }],
        reason: 'identifier_not_storable_by_new_service',
      });
    });
  });

  it('prefers the amount reason when a charge breaks both limits', () => {
    const decision = decideRoute(
      { messageId: 'a\u0000', chargeId: 'ch', amountCents: 2e12 },
      { mode: 'percentage', newTrafficPercent: 100 },
    );

    expect(decision.reason).toBe('amount_above_new_service_limit');
  });

  describe('percentage mode', () => {
    const chargeIdInBucket = (bucket: number): string => {
      for (let attempt = 0; ; attempt += 1) {
        const chargeId = `probe-${attempt}`;
        if (trafficBucketOf(chargeId) === bucket) return chargeId;
      }
    };
    const percentage = (newTrafficPercent: number): RoutingConfig => ({ mode: 'percentage', newTrafficPercent });
    const queueOf = (chargeId: string, percent: number, amountCents?: number) =>
      decideRoute({ messageId: 'm', chargeId, amountCents }, percentage(percent)).targets;

    it('sends a charge whose bucket is below the percentage to the new queue only', () => {
      expect(queueOf(chargeIdInBucket(9), 10)).toEqual([{ queue: 'new', role: 'primary' }]);
    });

    it('sends a charge whose bucket is at or above the percentage to legacy with a shadow copy on new', () => {
      expect(queueOf(chargeIdInBucket(10), 10)).toEqual([
        { queue: 'legacy', role: 'primary' },
        { queue: 'new', role: 'shadow' },
      ]);
    });

    it('sends everything to legacy (shadowed) at 0% and everything to new at 100%', () => {
      expect(queueOf(chargeIdInBucket(0), 0)).toEqual([
        { queue: 'legacy', role: 'primary' },
        { queue: 'new', role: 'shadow' },
      ]);
      expect(queueOf(chargeIdInBucket(99), 100)).toEqual([{ queue: 'new', role: 'primary' }]);
    });

    it('reports the percentage mode in the decision', () => {
      expect(decideRoute(message, percentage(50)).mode).toBe('percentage');
    });

    it('pins a charge above the new service limit to legacy even inside the new slice', () => {
      const chargeId = chargeIdInBucket(0);

      expect(decideRoute({ messageId: 'm', chargeId, amountCents: 2e12 }, percentage(100))).toEqual({
        mode: 'percentage',
        targets: [{ queue: 'legacy', role: 'primary' }],
        reason: 'amount_above_new_service_limit',
      });
    });

    it('keeps a charge exactly at the new service limit eligible for the new queue', () => {
      expect(queueOf(chargeIdInBucket(0), 100, 1e12)).toEqual([{ queue: 'new', role: 'primary' }]);
    });

    it('never moves a charge back to legacy when the percentage grows', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 100 }),
          (chargeId, first, second) => {
            const [low, high] = first <= second ? [first, second] : [second, first];
            return queueOf(chargeId, low)[0]?.queue !== 'new' || queueOf(chargeId, high)[0]?.queue === 'new';
          },
        ),
        { seed: FIXED_SEED },
      );
    });

    it('routes the same charge identically whatever the message id', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), (chargeId, a, b) => {
          const route = (messageId: string) => decideRoute({ messageId, chargeId }, percentage(50));
          return JSON.stringify(route(a)) === JSON.stringify(route(b));
        }),
        { seed: FIXED_SEED },
      );
    });
  });
});
