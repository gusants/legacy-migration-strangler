import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ENV_FILE = fileURLToPath(new URL('../../../.env', import.meta.url));

export const loadRepositoryEnv = (): void => {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
};

export const settingOrDefault = (name: string, defaults: Record<string, string>): string =>
  process.env[name] ?? defaults[name] ?? '';
