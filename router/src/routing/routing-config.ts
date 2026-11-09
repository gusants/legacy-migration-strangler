import { z } from 'zod';

export type RoutingConfig =
  | { mode: 'legacy' }
  | { mode: 'shadow' }
  | { mode: 'percentage'; newTrafficPercent: number }
  | { mode: 'new' };

export type RoutingMode = RoutingConfig['mode'];

export const routingConfigSchema: z.ZodType<RoutingConfig> = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('legacy') }),
  z.strictObject({ mode: z.literal('shadow') }),
]);

export type RoutingConfigProvider = {
  load(): Promise<RoutingConfig>;
};

export type RoutingConfigResolution = {
  config: RoutingConfig;
  fallbackReason?: string;
};

export type RoutingConfigResolver = {
  resolve(): Promise<RoutingConfigResolution>;
};
