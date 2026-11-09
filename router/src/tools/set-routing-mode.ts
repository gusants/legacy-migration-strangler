import { fileURLToPath } from 'node:url';
import { writeRoutingConfigAtomically } from './routing-config-writer.js';

const ROUTING_CONFIG_PATH = fileURLToPath(new URL('../../config/routing.json', import.meta.url));

const [mode] = process.argv.slice(2);

try {
  const config = await writeRoutingConfigAtomically(ROUTING_CONFIG_PATH, { mode });
  process.stdout.write(`routing mode set to ${config.mode} (${ROUTING_CONFIG_PATH})\n`);
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  process.stderr.write(`refused to set routing mode "${mode}": ${reason}\n`);
  process.exit(1);
}
