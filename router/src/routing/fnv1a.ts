const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export const fnv1a32 = (text: string): number =>
  Buffer.from(text, 'utf8').reduce(
    (hash, byte) => Math.imul(hash ^ byte, FNV_PRIME) >>> 0,
    FNV_OFFSET_BASIS,
  );
