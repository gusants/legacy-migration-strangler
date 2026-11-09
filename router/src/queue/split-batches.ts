import type { OutgoingMessage } from './queue-sender.js';

export const MAX_BATCH_ENTRIES = 10;
export const MAX_BATCH_BYTES = 262_144;

const STRING_DATA_TYPE = 'String';

const utf8Bytes = (text: string): number => Buffer.byteLength(text, 'utf8');

export const outgoingMessageBytes = ({ body, attributes }: OutgoingMessage): number =>
  utf8Bytes(body) +
  Object.entries(attributes).reduce(
    (total, [name, value]) => total + utf8Bytes(name) + utf8Bytes(STRING_DATA_TYPE) + utf8Bytes(value),
    0,
  );

type Batch<T> = { items: T[]; bytes: number };

const hasRoom = ({ items, bytes }: Batch<unknown>, itemBytes: number): boolean =>
  items.length < MAX_BATCH_ENTRIES && bytes + itemBytes <= MAX_BATCH_BYTES;

export const splitBatches = <T>(items: readonly T[], bytesOf: (item: T) => number): T[][] => {
  const batches: Batch<T>[] = [];
  for (const item of items) {
    const itemBytes = bytesOf(item);
    const last = batches.at(-1);
    if (last && hasRoom(last, itemBytes)) {
      last.items.push(item);
      last.bytes += itemBytes;
    } else {
      batches.push({ items: [item], bytes: itemBytes });
    }
  }
  return batches.map(({ items: batchItems }) => batchItems);
};
