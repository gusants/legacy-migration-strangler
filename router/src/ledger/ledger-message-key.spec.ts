import fc from 'fast-check';
import { ledgerMessageKeyOf, readableMessageIdOf } from './ledger-message-key.js';

describe('ledgerMessageKeyOf', () => {
  it('is the hex of the UTF-16LE code units', () => {
    expect(ledgerMessageKeyOf('a')).toBe('6100');
    expect(ledgerMessageKeyOf('a\u0000')).toBe('61000000');
    expect(ledgerMessageKeyOf('\uD800')).toBe('00d8');
  });

  it('keeps distinct ids distinct when UTF-8 would fold lone surrogates into U+FFFD', () => {
    const keys = new Set(['\uD800', '\uD801', '\uDC00', '�'].map(ledgerMessageKeyOf));

    expect(keys.size).toBe(4);
  });

  it('is injective over arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), fc.string({ unit: 'binary' }), (left, right) => {
        expect(ledgerMessageKeyOf(left) === ledgerMessageKeyOf(right)).toBe(left === right);
      }),
    );
  });

  it('only uses characters Postgres text stores', () => {
    expect(ledgerMessageKeyOf('\u0000\uD800x')).toMatch(/^[0-9a-f]+$/);
  });
});

describe('readableMessageIdOf', () => {
  it('returns the id when Postgres can store it', () => {
    expect(readableMessageIdOf('msg-é-😀')).toBe('msg-é-😀');
  });

  it.each([['NUL', 'a\u0000b'], ['lone high surrogate', 'a\uD800'], ['lone low surrogate', '\uDC00a']])(
    'returns null for %s',
    (_label, id) => {
      expect(readableMessageIdOf(id)).toBeNull();
    },
  );
});
