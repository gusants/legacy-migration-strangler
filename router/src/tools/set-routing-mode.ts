import { fileURLToPath } from 'node:url';
import { parseRoutingCommand } from './routing-command.js';
import { writeRoutingConfigAtomically } from './routing-config-writer.js';

const ROUTING_CONFIG_PATH = fileURLToPath(new URL('../../config/routing.json', import.meta.url));

const argv = process.argv.slice(2);

try {
  const config = await writeRoutingConfigAtomically(ROUTING_CONFIG_PATH, parseRoutingCommand(argv));
  process.stdout.write(`routing config set to ${JSON.stringify(config)} (${ROUTING_CONFIG_PATH})\n`);
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  process.stderr.write(`refused to set routing config "${argv.join(' ')}": ${reason}\n`);
  process.exit(1);
}
