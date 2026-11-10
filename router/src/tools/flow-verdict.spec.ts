import {
  describeVerdict,
  failedChecks,
  isFlowIntact,
  judgeFlow,
  type FlowEvidence,
  type QueueSnapshot,
  type RoutedCopy,
  type Service,
} from './flow-verdict.js';

const quietQueues: QueueSnapshot = { incomingDlq: 7, legacyDlq: 4, newDlq: 2, incomingPending: 0 };

const primary = (messageId: string, destination: Service, chargeId = `ch_${messageId}`): RoutedCopy => ({
  messageId,
  chargeId,
  role: 'primary',
  destination,
});
const shadow = (messageId: string): RoutedCopy => ({
  messageId,
  chargeId: `ch_${messageId}`,
  role: 'shadow',
  destination: 'new',
});

const intactEvidence = (overrides: Partial<FlowEvidence> = {}): FlowEvidence => ({
  expectedIds: ['a', 'b', 'c'],
  legacyStoredIds: ['a', 'b'],
  newStoredIds: ['c'],
  shadowStoredIds: ['a', 'b'],
  routedCopies: [primary('a', 'legacy'), primary('b', 'legacy'), primary('c', 'new'), shadow('a'), shadow('b')],
  invalidInjected: 0,
  before: quietQueues,
  after: quietQueues,
  ...overrides,
});

describe('flow verdict', () => {
  it('accepts exactly-once routing with every message on the side the router chose', () => {
    const verdict = judgeFlow(intactEvidence());

    expect(failedChecks(verdict)).toEqual([]);
    expect(verdict.legacy.expected).toBe(2);
    expect(verdict.new.expected).toBe(1);
    expect(verdict.shadow.expected).toBe(2);
  });

  it('reports the real split in the description', () => {
    expect(describeVerdict(judgeFlow(intactEvidence()), 'run1')).toContain('split: legacy 2 / new 1 (of 3 valid messages)');
  });

  it('reports a message lost on the side it was routed to', () => {
    const verdict = judgeFlow(intactEvidence({ legacyStoredIds: ['a'] }));

    expect(verdict.legacy.missing).toEqual(['b']);
    expect(failedChecks(verdict)).toEqual(['messages routed to legacy official missing from its table']);
  });

  it('reports a message stored on the side it was not routed to, which is a double result', () => {
    const verdict = judgeFlow(intactEvidence({ legacyStoredIds: ['a', 'b', 'c'] }));

    expect(verdict.legacy.unexpected).toEqual(['c']);
    expect(failedChecks(verdict)).toEqual(['rows in the legacy official table that were not routed there by this run']);
  });

  it('reports duplicated rows in the new official table', () => {
    const verdict = judgeFlow(intactEvidence({ newStoredIds: ['c', 'c'] }));

    expect(verdict.new).toMatchObject({ rows: 2, distinct: 1 });
    expect(failedChecks(verdict)).toEqual(['duplicated rows in the new official table']);
  });

  it('reports a shadow copy that never reached the shadow table', () => {
    const verdict = judgeFlow(intactEvidence({ shadowStoredIds: ['a'] }));

    expect(verdict.shadow.missing).toEqual(['b']);
    expect(isFlowIntact(verdict)).toBe(false);
  });

  it('reports shadow rows that were never routed as shadow', () => {
    const verdict = judgeFlow(intactEvidence({ shadowStoredIds: ['a', 'b', 'c'] }));

    expect(verdict.shadow.unexpected).toEqual(['c']);
    expect(isFlowIntact(verdict)).toBe(false);
  });

  it('counts charges with several messages and accepts them when they share one service', () => {
    const verdict = judgeFlow(
      intactEvidence({
        routedCopies: [primary('a', 'legacy', 'shared'), primary('b', 'legacy', 'shared'), primary('c', 'new'), shadow('a'), shadow('b')],
      }),
    );

    expect(verdict.chargesWithSeveralMessages).toBe(1);
    expect(verdict.chargesSplitAcrossServices).toEqual([]);
    expect(isFlowIntact(verdict)).toBe(true);
  });

  it('fails when the messages of one charge were sent to different services', () => {
    const verdict = judgeFlow(
      intactEvidence({
        routedCopies: [primary('a', 'legacy', 'shared'), primary('b', 'new', 'shared'), primary('c', 'new'), shadow('a')],
      }),
    );

    expect(verdict.chargesSplitAcrossServices).toEqual(['shared']);
    expect(failedChecks(verdict)).toContain('charges whose messages the router sent to different services');
  });

  it('detects duplicate delivery that the database hides, by the router log', () => {
    const verdict = judgeFlow(intactEvidence({ routedCopies: [...intactEvidence().routedCopies, primary('a', 'legacy')] }));

    expect(verdict.routedMoreThanOnce).toEqual(['a']);
    expect(failedChecks(verdict)).toContain('messages routed more than once by the router');
  });

  it('reports a valid message the router never routed', () => {
    const verdict = judgeFlow(
      intactEvidence({ routedCopies: [primary('a', 'legacy'), primary('b', 'legacy'), shadow('a'), shadow('b')] }),
    );

    expect(verdict.notRouted).toEqual(['c']);
    expect(failedChecks(verdict)).toContain('valid messages never routed by the router');
  });

  it('reports routed ids this run did not produce and ignores them in the per-side tables', () => {
    const verdict = judgeFlow(intactEvidence({ routedCopies: [...intactEvidence().routedCopies, primary('z', 'new')] }));

    expect(verdict.routedUnexpected).toEqual(['z']);
    expect(verdict.new.expected).toBe(1);
    expect(failedChecks(verdict)).toEqual(['routed messages this run did not produce']);
  });

  it.each([
    ['legacyDlq', 'charges-legacy-dlq grew'],
    ['newDlq', 'charges-new-dlq grew'],
  ] as const)('fails when %s grew', (queue, description) => {
    const verdict = judgeFlow(intactEvidence({ after: { ...quietQueues, [queue]: quietQueues[queue] + 1 } }));

    expect(failedChecks(verdict)).toEqual([description]);
  });

  it('expects the incoming dead-letter queue to grow by exactly the injected invalid messages', () => {
    const grown = { ...quietQueues, incomingDlq: 10 };

    expect(isFlowIntact(judgeFlow(intactEvidence({ invalidInjected: 3, after: grown })))).toBe(true);
    expect(isFlowIntact(judgeFlow(intactEvidence({ invalidInjected: 2, after: grown })))).toBe(false);
    expect(isFlowIntact(judgeFlow(intactEvidence({ invalidInjected: 4, after: grown })))).toBe(false);
  });

  it('fails when the incoming queue still holds messages', () => {
    const verdict = judgeFlow(intactEvidence({ after: { ...quietQueues, incomingPending: 2 } }));

    expect(failedChecks(verdict)).toEqual(['charges-incoming still holds messages']);
  });

  it('states exactly what was proved when everything holds', () => {
    const verdict = judgeFlow(intactEvidence({ invalidInjected: 1, after: { ...quietQueues, incomingDlq: 8 } }));

    const text = describeVerdict(verdict, 'run1');

    expect(text).toContain('RESULT: OK proved: 3 valid messages, each routed exactly once');
    expect(text).toContain('2 in the legacy official table and 1 in the new official table');
    expect(text).toContain('charges-legacy-dlq and charges-new-dlq did not grow');
    expect(text).toContain('1 invalid message(s) dead-lettered in charges-incoming-dlq');
  });

  it('lists what failed and samples the offending ids', () => {
    const verdict = judgeFlow(intactEvidence({ routedCopies: [...intactEvidence().routedCopies, primary('a', 'legacy')] }));

    const text = describeVerdict(verdict, 'run1');

    expect(text).toContain('routed_more_than_once=1 (a)');
    expect(text).toContain('RESULT: FAILED: messages routed more than once by the router');
  });
});
