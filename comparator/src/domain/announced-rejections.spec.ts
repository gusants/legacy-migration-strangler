import { parseAnnouncedRejections, WILL_DEAD_LETTER_REASON } from './announced-rejections.js';

const line = (entry: Record<string, unknown>): string => `router-1  | ${JSON.stringify(entry)}`;

describe('parseAnnouncedRejections', () => {
  it('collects routed messages of the run flagged as will-dead-letter, once each', () => {
    const logs = [
      line({ event: 'routed', messageId: 'r_1', reason: WILL_DEAD_LETTER_REASON }),
      line({ event: 'routed', messageId: 'r_1', reason: WILL_DEAD_LETTER_REASON }),
    ].join('\n');

    expect(parseAnnouncedRejections(logs, 'r_')).toEqual(['r_1']);
  });

  it.each([
    ['another event', { event: 'send_rejected', messageId: 'r_1', reason: WILL_DEAD_LETTER_REASON }],
    ['another reason', { event: 'routed', messageId: 'r_1', reason: 'ledger_pinned_to_first_service' }],
    ['no reason', { event: 'routed', messageId: 'r_1' }],
    ['another run', { event: 'routed', messageId: 'x_1', reason: WILL_DEAD_LETTER_REASON }],
    ['a non-text id', { event: 'routed', messageId: 7, reason: WILL_DEAD_LETTER_REASON }],
  ])('ignores %s', (_label, entry) => {
    expect(parseAnnouncedRejections(line(entry), 'r_')).toEqual([]);
  });

  it('ignores lines that are not JSON', () => {
    expect(parseAnnouncedRejections('no json here\nrouter | {broken\n\n', 'r_')).toEqual([]);
  });
});
