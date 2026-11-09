import { createSqsClient } from '../config/create-sqs-client.js';
import { loadLocalToolsEnv } from './local-environment.js';
import { redriveQueue } from './redrive-queue.js';

const USAGE = 'usage: pnpm redrive <dead-letter-queue-name> <destination-queue-name>';

const [source, destination] = process.argv.slice(2);

if (!source || !destination) {
  process.stderr.write(`${USAGE}\n`);
  process.exit(1);
}

const env = loadLocalToolsEnv();
const client = createSqsClient(env);
const urlOf = (queueName: string): string => new URL(queueName, env.incomingQueueUrl).toString();

try {
  const { moved, failed } = await redriveQueue(client, urlOf(source), urlOf(destination));
  process.stdout.write(`redrive ${source} -> ${destination}: ${moved} message(s) moved, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
} catch (error) {
  process.stderr.write(`redrive failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
