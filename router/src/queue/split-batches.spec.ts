import { MAX_BATCH_BYTES, outgoingMessageBytes, splitBatches } from './split-batches.js';

const sizes = (batches: number[][]): number[] => batches.map((batch) => batch.length);

describe('splitBatches', () => {
  it('returns no batch for no items', () => {
    expect(splitBatches([], () => 1)).toEqual([]);
  });

  it('caps a batch at 10 entries', () => {
    const batches = splitBatches(Array.from({ length: 23 }, (_, index) => index), () => 1);

    expect(sizes(batches)).toEqual([10, 10, 3]);
  });

  it('closes a batch before it would exceed the byte limit', () => {
    const third = Math.floor(MAX_BATCH_BYTES / 3);

    const batches = splitBatches([1, 2, 3, 4], () => third + 1);

    expect(sizes(batches)).toEqual([2, 2]);
  });

  it('accepts a batch that lands exactly on the byte limit', () => {
    expect(sizes(splitBatches([1, 2], () => MAX_BATCH_BYTES / 2))).toEqual([2]);
  });

  it('keeps an oversized item alone in its own batch', () => {
    const batches = splitBatches([1, 2, 3], (item) => (item === 2 ? MAX_BATCH_BYTES + 1 : 10));

    expect(batches).toEqual([[1], [2], [3]]);
  });
});

describe('outgoingMessageBytes', () => {
  it('counts the UTF-8 body plus attribute name, data type and value', () => {
    const bytes = outgoingMessageBytes({ id: '0', body: 'çã', attributes: { ab: 'xyz' } });

    expect(bytes).toBe(4 + 2 + 'String'.length + 3);
  });
});
