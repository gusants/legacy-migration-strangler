import { z } from 'zod';

export const MAX_AMOUNT_CENTS = 1_000_000_000_000;
const MAX_IDENTIFIER_LENGTH = 128;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isCalendarDate = (value: string): boolean => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const identifier = z
  .string()
  .max(MAX_IDENTIFIER_LENGTH)
  .refine((value) => value.trim().length > 0);

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
});
