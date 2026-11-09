import { rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { prettifyError } from 'zod';
import { routingConfigSchema, type RoutingConfig } from '../routing/routing-config.js';

export const writeRoutingConfigAtomically = async (
  path: string,
  candidate: unknown,
): Promise<RoutingConfig> => {
  const parsed = routingConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(prettifyError(parsed.error));
  }
  const config = parsed.data;
  const temporaryPath = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  try {
    await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`);
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  return config;
};
