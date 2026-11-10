import { messageIdsPinnedToLegacy, type RecordedServiceLookup } from './legacy-pins.js';

const body = (messageId: string): string => JSON.stringify({ messageId, chargeId: `ch_${messageId}` });

const ledgerWith =
  (claims: Record<string, 'legacy' | 'new'>): RecordedServiceLookup =>
  async (messageId) =>
    claims[messageId];

describe('messageIdsPinnedToLegacy', () => {
  it('returns only the messages whose ledger claim is legacy', async () => {
    const pinned = await messageIdsPinnedToLegacy(
      [body('m-legacy'), body('m-new'), body('m-unclaimed')],
      ledgerWith({ 'm-legacy': 'legacy', 'm-new': 'new' }),
    );

    expect(pinned).toEqual(['m-legacy']);
  });

  it('ignores bodies the router cannot route, which never get a claim', async () => {
    const lookups: string[] = [];
    const pinned = await messageIdsPinnedToLegacy(['{"broken":', '{"chargeId":"ch_1"}', 'plain text'], async (messageId) => {
      lookups.push(messageId);
      return 'legacy';
    });

    expect(pinned).toEqual([]);
    expect(lookups).toEqual([]);
  });

  it('keeps every copy of a pinned message found in the queue', async () => {
    const pinned = await messageIdsPinnedToLegacy([body('m-1'), body('m-1')], ledgerWith({ 'm-1': 'legacy' }));

    expect(pinned).toEqual(['m-1', 'm-1']);
  });
});
