import { parseArgs } from 'node:util';
import { fileSafeRunId } from './report-files.js';

export type ExactlyOnceOptions = { runId: string; expectedCount: number; settleSeconds: number; runStartedAt?: Date };

const DEFAULT_SETTLE_SECONDS = 30;

const nonNegativeInteger = (name: string, raw: string): number => {
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isInteger(value) || value < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }
  return value;
};

const isoTimestamp = (name: string, raw: string): Date => {
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) throw new Error(`--${name} must be an ISO 8601 timestamp`);
  return value;
};

const requiredOption = (name: string, value: string | undefined): string => {
  if (value === undefined) throw new Error(`--${name} is required`);
  return value;
};

export const parseExactlyOnceOptions = (argv: readonly string[]): ExactlyOnceOptions => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      'run-id': { type: 'string' },
      'expected-count': { type: 'string' },
      'settle-seconds': { type: 'string', default: String(DEFAULT_SETTLE_SECONDS) },
      'run-started-at': { type: 'string' },
    },
  });
  const expectedCount = nonNegativeInteger('expected-count', requiredOption('expected-count', values['expected-count']));
  if (expectedCount < 1) throw new Error('--expected-count must be at least 1');
  return {
    runId: fileSafeRunId(requiredOption('run-id', values['run-id'])),
    expectedCount,
    settleSeconds: nonNegativeInteger('settle-seconds', values['settle-seconds']),
    ...(values['run-started-at'] === undefined
      ? {}
      : { runStartedAt: isoTimestamp('run-started-at', values['run-started-at']) }),
  };
};
