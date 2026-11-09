import { readFile } from 'node:fs/promises';
import {
  routingConfigSchema,
  type RoutingConfig,
  type RoutingConfigProvider,
} from './routing-config.js';
import { RoutingConfigError } from './routing-errors.js';

export class FileRoutingConfigProvider implements RoutingConfigProvider {
  constructor(private readonly path: string) {}

  async load(): Promise<RoutingConfig> {
    const raw = await this.readRaw();
    const parsed = routingConfigSchema.safeParse(this.parseJson(raw));
    if (!parsed.success) {
      throw new RoutingConfigError(
        `invalid routing config at ${this.path}: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  }

  private async readRaw(): Promise<string> {
    try {
      return await readFile(this.path, 'utf8');
    } catch (cause) {
      throw new RoutingConfigError(`cannot read routing config at ${this.path}`, { cause });
    }
  }

  private parseJson(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch (cause) {
      throw new RoutingConfigError(`routing config at ${this.path} is not valid JSON`, { cause });
    }
  }
}
