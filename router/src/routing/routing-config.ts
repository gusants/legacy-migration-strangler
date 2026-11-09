import { z } from 'zod';

export const routingConfigSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('legacy') }),
  z.strictObject({ mode: z.literal('shadow') }),
  z.strictObject({
    mode: z.literal('percentage'),
    newTrafficPercent: z.number().min(0).max(100),
  }),
  z.strictObject({ mode: z.literal('new') }),
]);

export type RoutingConfig = z.infer<typeof routingConfigSchema>;

export type RoutingMode = RoutingConfig['mode'];

export type RoutingConfigProvider = {
  load(): Promise<RoutingConfig>;
};
