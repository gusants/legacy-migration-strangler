import { z } from 'zod';
import { COMPARED_FIELDS } from './charge-result.js';

const operandSchema = z.union([
  z.strictObject({ value: z.number() }),
  z.strictObject({ legacy: z.string() }),
  z.strictObject({ shadow: z.string() }),
  z.strictObject({ absDifference: z.string() }),
]);

const COMPARISON_OPERATORS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'] as const;

export type Operand = z.infer<typeof operandSchema>;

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { op: (typeof COMPARISON_OPERATORS)[number]; left: Operand; right: Operand }
  | { op: 'foldedMessageIdMatchesLegacyRow' };

const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ all: z.array(conditionSchema).min(1) }),
    z.strictObject({ any: z.array(conditionSchema).min(1) }),
    z.strictObject({ op: z.enum(COMPARISON_OPERATORS), left: operandSchema, right: operandSchema }),
    z.strictObject({ op: z.literal('foldedMessageIdMatchesLegacyRow') }),
  ]),
);

const ruleSchema = z.enum(['R1', 'R2', 'R3', 'R4/R5', 'R6', 'R7', 'chargeId', 'total']);

const baseShape = {
  id: z.string().min(1),
  description: z.string().min(1),
  affectedRules: z.array(ruleSchema),
  when: conditionSchema,
};

const knownDivergenceSchema = z.discriminatedUnion('scope', [
  z.strictObject({ ...baseShape, scope: z.literal('field'), explains: z.array(z.enum(COMPARED_FIELDS)).min(1) }),
  z.strictObject({ ...baseShape, scope: z.literal('legacy_only') }),
  z.strictObject({ ...baseShape, scope: z.literal('shadow_only') }),
]);

export type KnownDivergence = z.infer<typeof knownDivergenceSchema>;

const knownDivergencesSchema = z
  .array(knownDivergenceSchema)
  .refine((all) => new Set(all.map(({ id }) => id)).size === all.length, 'known divergence ids must be unique');

export const parseKnownDivergences = (raw: unknown): KnownDivergence[] => knownDivergencesSchema.parse(raw);
