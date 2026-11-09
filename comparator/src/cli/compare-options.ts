import { parseArgs } from 'node:util';
import type { Scope } from '../application/ports.js';

export type CompareOptions = { scope: Scope; settleSeconds: number };

const DEFAULT_SETTLE_SECONDS = 30;

const parseSettleSeconds = (raw: string | undefined): number => {
  const seconds = raw === undefined ? DEFAULT_SETTLE_SECONDS : Number(raw);
  if (!Number.isInteger(seconds) || seconds < 0) {
    throw new Error('--settle-seconds must be a non-negative integer');
  }
  return seconds;
};

const parseScope = (runId: string | undefined, since: string | undefined): Scope => {
  if ((runId === undefined) === (since === undefined)) {
    throw new Error('exactly one of --run-id or --since is required');
  }
  if (runId !== undefined) return { runId };
  const date = new Date(since as string);
  if (Number.isNaN(date.getTime())) throw new Error('--since must be an ISO-8601 date');
  return { since: date };
};

export const parseCompareOptions = (argv: readonly string[]): CompareOptions => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      'run-id': { type: 'string' },
      since: { type: 'string' },
      'settle-seconds': { type: 'string' },
    },
  });
  return {
    scope: parseScope(values['run-id'], values.since),
    settleSeconds: parseSettleSeconds(values['settle-seconds']),
  };
};
