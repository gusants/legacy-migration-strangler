import { fnv1a32 } from './fnv1a.js';

describe('fnv1a32', () => {
  it.each([
    ['', 0x811c9dc5],
    ['a', 0xe40c292c],
    ['b', 0xe70c2de5],
    ['foobar', 0xbf9cf968],
  ])('matches the published FNV-1a 32-bit vector for %j', (text, expected) => {
    expect(fnv1a32(text)).toBe(expected);
  });

  it('hashes the UTF-8 bytes of the text', () => {
    expect(fnv1a32('\u00e9')).toBe(0x1e9de8c1);
  });
});
