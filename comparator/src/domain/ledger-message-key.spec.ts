import { ledgerMessageKeyOf } from './ledger-message-key.js';

describe('ledgerMessageKeyOf', () => {
  it('matches the router key: hex of the UTF-16LE code units', () => {
    expect(ledgerMessageKeyOf('a')).toBe('6100');
    expect(ledgerMessageKeyOf('a\u0000')).toBe('61000000');
    expect(ledgerMessageKeyOf('\uD800')).toBe('00d8');
  });
});
