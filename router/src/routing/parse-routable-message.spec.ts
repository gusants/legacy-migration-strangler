import { parseRoutableMessage } from './parse-routable-message.js';

describe('parseRoutableMessage', () => {
  it('extracts the routing identifiers and ignores the rest of the payload', () => {
    const body = JSON.stringify({ messageId: 'm1', chargeId: 'c1', amountCents: 100 });

    expect(parseRoutableMessage(body)).toEqual({ messageId: 'm1', chargeId: 'c1' });
  });

  it.each([
    ['invalid JSON', '{nope'],
    ['a JSON array', '[]'],
    ['null', 'null'],
    ['missing messageId', '{"chargeId":"c1"}'],
    ['missing chargeId', '{"messageId":"m1"}'],
    ['empty messageId', '{"messageId":"","chargeId":"c1"}'],
    ['non-string chargeId', '{"messageId":"m1","chargeId":7}'],
  ])('returns undefined for %s', (_name, body) => {
    expect(parseRoutableMessage(body)).toBeUndefined();
  });
});
