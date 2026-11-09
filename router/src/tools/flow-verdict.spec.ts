import {
  describeVerdict,
  failedChecks,
  isFlowIntact,
  judgeFlow,
  type FlowEvidence,
  type QueueSnapshot,
} from './flow-verdict.js';

const quietQueues: QueueSnapshot = { incomingDlq: 7, legacyDlq: 4, incomingPending: 0 };

const intactEvidence = (overrides: Partial<FlowEvidence> = {}): FlowEvidence => ({
  expectedIds: ['a', 'b'],
  storedIds: ['b', 'a'],
  routedIds: ['a', 'b'],
  shadowRoutedIds: [],
  invalidInjected: 0,
  before: quietQueues,
  after: quietQueues,
  ...overrides,
});

describe('flow verdict', () => {
  it('reports how many shadow copies the router sent without judging them', () => {
    const verdict = judgeFlow(intactEvidence({ shadowRoutedIds: ['a', 'b'] }));

    expect(verdict.shadowCopiesSent).toBe(2);
    expect(isFlowIntact(verdict)).toBe(true);
    expect(describeVerdict(verdict, 'run1')).toContain('shadow copies sent to charges-new: 2');
  });

  it('accepts exactly-once routing, storage and untouched dead letters', () => {
    expect(failedChecks(judgeFlow(intactEvidence()))).toEqual([]);
  });

  it('reports lost messages', () => {
    const verdict = judgeFlow(intactEvidence({ expectedIds: ['a', 'b', 'c'], storedIds: ['a'], routedIds: ['a', 'b', 'c'] }));

    expect(verdict.missing).toEqual(['b', 'c']);
    expect(isFlowIntact(verdict)).toBe(false);
  });

  it('reports duplicated database rows', () => {
    const verdict = judgeFlow(intactEvidence({ expectedIds: ['a'], storedIds: ['a', 'a'], routedIds: ['a'] }));

    expect(verdict).toMatchObject({ rows: 2, distinct: 1 });
    expect(failedChecks(verdict)).toEqual(['duplicated rows in the legacy database']);
  });

  it('reports stored ids nobody asked for', () => {
    const verdict = judgeFlow(intactEvidence({ storedIds: ['a', 'b', 'z'] }));

    expect(verdict.unexpected).toEqual(['z']);
    expect(isFlowIntact(verdict)).toBe(false);
  });

  it('detects duplicate delivery that the database hides, by the router log', () => {
    const verdict = judgeFlow(intactEvidence({ routedIds: ['a', 'b', 'a'] }));

    expect(verdict.rows).toBe(verdict.distinct);
    expect(verdict.routedMoreThanOnce).toEqual(['a']);
    expect(failedChecks(verdict)).toEqual(['messages routed more than once by the router']);
  });

  it('reports a valid message the router never routed', () => {
    const verdict = judgeFlow(intactEvidence({ routedIds: ['a'] }));

    expect(verdict.notRouted).toEqual(['b']);
    expect(failedChecks(verdict)).toEqual(['valid messages never routed by the router']);
  });

  it('reports routed ids this run did not produce', () => {
    const verdict = judgeFlow(intactEvidence({ routedIds: ['a', 'b', 'z'] }));

    expect(verdict.routedUnexpected).toEqual(['z']);
    expect(isFlowIntact(verdict)).toBe(false);
  });

  it('fails when the legacy dead-letter queue grew', () => {
    const verdict = judgeFlow(intactEvidence({ after: { ...quietQueues, legacyDlq: 5 } }));

    expect(verdict.legacyDlqGrowth).toBe(1);
    expect(failedChecks(verdict)).toEqual(['charges-legacy-dlq grew']);
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
    const verdict = judgeFlow(
      intactEvidence({ invalidInjected: 1, after: { ...quietQueues, incomingDlq: 8 } }),
    );

    const text = describeVerdict(verdict, 'run1');

    expect(text).toContain('RESULT: OK proved: 2 valid messages stored in the legacy database, each routed exactly once');
    expect(text).toContain('charges-legacy-dlq did not grow');
    expect(text).toContain('1 invalid message(s) dead-lettered in charges-incoming-dlq');
  });

  it('lists what failed and samples the offending ids', () => {
    const verdict = judgeFlow(intactEvidence({ routedIds: ['a', 'b', 'a'] }));

    const text = describeVerdict(verdict, 'run1');

    expect(text).toContain('routed_more_than_once=1 (a)');
    expect(text).toContain('RESULT: FAILED: messages routed more than once by the router');
  });
});
