import { z } from 'zod';

export const MAX_AMOUNT_CENTS = 1_000_000_000_000;
const MAX_IDENTIFIER_BYTES = 128;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PHP_TRIMMED_EDGES = /^[ \t\n\r\0\v]+|[ \t\n\r\0\v]+$/g;
const NUL_CHARACTER = '\0';

const isCalendarDate = (value: string): boolean => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const fitsIdentifierBytes = (value: string): boolean => Buffer.byteLength(value, 'utf8') <= MAX_IDENTIFIER_BYTES;

const isBlankForLegacy = (value: string): boolean => value.replace(PHP_TRIMMED_EDGES, '').length === 0;

const isStorableText = (value: string): boolean => value.isWellFormed() && !value.includes(NUL_CHARACTER);

const identifier = z
  .string()
  .refine(fitsIdentifierBytes)
  .refine((value) => !isBlankForLegacy(value))
  .refine(isStorableText);

const isoDate = z.string().regex(ISO_DATE_PATTERN).refine(isCalendarDate);

export const chargeMessageSchema = z.object({
  messageId: identifier,
  chargeId: identifier,
  amountCents: z.number().int().positive().max(MAX_AMOUNT_CENTS),
  dueDate: isoDate,
  referenceDate: isoDate,
  paid: z.boolean(),
  planType: z.enum(['monthly', 'yearly']),
  failedAttempts: z.number().int().min(0),
  paymentMethod: z.enum(['pix', 'boleto', 'card']).optional(),
});
