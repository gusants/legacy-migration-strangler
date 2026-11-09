import type { Payload } from '../domain/charge-result.js';

const isPlainObject = (value: unknown): value is Payload =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const decode = (raw: unknown): unknown => (typeof raw === 'string' ? JSON.parse(raw) : raw);

export const parsePayload = (raw: unknown): Payload | null => {
  try {
    const decoded = decode(raw);
    return isPlainObject(decoded) ? decoded : null;
  } catch {
    return null;
  }
};

export const escapeLikePattern = (value: string): string => value.replace(/[\\%_]/g, '\\$&');
