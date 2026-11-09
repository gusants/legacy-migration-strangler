import type {
  RoutingConfig,
  RoutingConfigProvider,
  RoutingConfigResolution,
  RoutingConfigResolver,
} from './routing-config.js';

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export class LastValidRoutingConfigResolver implements RoutingConfigResolver {
  private lastValid: RoutingConfig | undefined;

  constructor(private readonly provider: RoutingConfigProvider) {}

  async resolve(): Promise<RoutingConfigResolution> {
    try {
      const config = await this.provider.load();
      this.lastValid = config;
      return { config };
    } catch (error) {
      if (!this.lastValid) throw error;
      return { config: this.lastValid, fallbackReason: errorText(error) };
    }
  }
}
