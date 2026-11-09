import { parseArgs } from 'node:util';

const DEFAULT_COUNT = 200;
const DEFAULT_SEED = 20_261_109;
const DEFAULT_TIMEOUT_SECONDS = 300;

export type VerifyOptions = {
  count: number;
  invalid: number;
  seed: number;
  timeoutSeconds: number;
};

const integerAtLeast = (name: string, raw: string, minimum: number): number => {
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isInteger(value) || value < minimum) {
    throw new Error(`--${name} must be an integer >= ${minimum}, received "${raw}"`);
  }
  return value;
};

export const parseVerifyOptions = (argv: readonly string[]): VerifyOptions => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      count: { type: 'string', default: String(DEFAULT_COUNT) },
      invalid: { type: 'string', default: '0' },
      seed: { type: 'string', default: String(DEFAULT_SEED) },
      timeout: { type: 'string', default: String(DEFAULT_TIMEOUT_SECONDS) },
    },
  });
  return {
    count: integerAtLeast('count', values.count, 1),
    invalid: integerAtLeast('invalid', values.invalid, 0),
    seed: integerAtLeast('seed', values.seed, 0),
    timeoutSeconds: integerAtLeast('timeout', values.timeout, 1),
  };
};
