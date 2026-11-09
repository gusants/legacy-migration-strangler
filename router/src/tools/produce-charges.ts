import { parseArgs } from 'node:util';
import { newRunId, produceToLocalQueue, type ProduceOptions } from './charge-producer.js';
import { loadLocalToolsEnv } from './local-environment.js';

const DEFAULT_COUNT = 200;
const DEFAULT_SEED = 20_261_109;

const parseOptions = (argv: string[]): ProduceOptions => {
  const { values } = parseArgs({
    args: argv,
    options: {
      count: { type: 'string', default: String(DEFAULT_COUNT) },
      invalid: { type: 'string', default: '0' },
      seed: { type: 'string', default: String(DEFAULT_SEED) },
      rate: { type: 'string', default: '0' },
      'run-id': { type: 'string', default: newRunId() },
    },
  });
  return {
    count: Number(values.count),
    invalid: Number(values.invalid),
    seed: Number(values.seed),
    ratePerSecond: Number(values.rate),
    runId: values['run-id'],
  };
};

const options = parseOptions(process.argv.slice(2));
const summary = await produceToLocalQueue(loadLocalToolsEnv(), options);
process.stdout.write(`${JSON.stringify(summary)}\n`);
