export type GeneratedCharge = {
  messageId: string;
  chargeId: string;
  amountCents: number;
  dueDate: string;
  referenceDate: string;
  paid: boolean;
  planType: 'monthly' | 'yearly';
  failedAttempts: number;
};

type ChargeTemplate = Omit<GeneratedCharge, 'messageId' | 'chargeId'>;

const DUE_DATE = '2026-10-01';
const RANDOM_DUE_DATE_START = '2026-06-01';
const RANDOM_DUE_DATE_SPREAD_DAYS = 120;
const RANDOM_REFERENCE_OFFSET_MIN_DAYS = -5;
const RANDOM_REFERENCE_OFFSET_SPREAD_DAYS = 66;
const RANDOM_AMOUNT_MIN_CENTS = 100;
const RANDOM_AMOUNT_SPREAD_CENTS = 500_000;
const RANDOM_MAX_FAILED_ATTEMPTS = 5;
const MILLISECONDS_PER_DAY = 86_400_000;

const template = (
  amountCents: number,
  referenceDate: string,
  overrides: Partial<ChargeTemplate> = {},
): ChargeTemplate => ({
  amountCents,
  dueDate: DUE_DATE,
  referenceDate,
  paid: true,
  planType: 'monthly',
  failedAttempts: 0,
  ...overrides,
});

const documentExamples: readonly ChargeTemplate[] = [
  template(10_000, '2026-10-01'),
  template(10_000, '2026-10-11'),
  template(10_000, '2026-10-03', { planType: 'yearly' }),
  template(10_000, '2026-10-11', { planType: 'yearly' }),
  template(15_000, '2026-11-15'),
  template(9_999, '2026-10-02'),
  template(2_525, '2026-10-02'),
];

const boundaryCases: readonly ChargeTemplate[] = [
  template(10_000, '2026-10-04', { planType: 'yearly' }),
  template(10_000, '2026-10-05', { planType: 'yearly' }),
  template(10_000, '2026-10-11', { paid: false, failedAttempts: 2 }),
  template(10_000, '2026-10-11', { paid: false, failedAttempts: 3 }),
  template(10_000, '2026-09-25'),
  template(2_525, '2026-10-02', { planType: 'yearly' }),
];

const legacyIntegerOverflowCases: readonly ChargeTemplate[] = [
  template(2_200_000_000, '2026-10-11'),
  template(3_000_000_000, '2026-10-11'),
];

export const fixedTemplates: readonly ChargeTemplate[] = [
  ...documentExamples,
  ...boundaryCases,
  ...legacyIntegerOverflowCases,
];

const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const addDays = (isoDate: string, days: number): string =>
  new Date(Date.parse(isoDate) + days * MILLISECONDS_PER_DAY).toISOString().slice(0, 10);

const randomTemplate = (random: () => number): ChargeTemplate => {
  const integer = (spread: number): number => Math.floor(random() * spread);
  const dueDate = addDays(RANDOM_DUE_DATE_START, integer(RANDOM_DUE_DATE_SPREAD_DAYS));
  return {
    amountCents: RANDOM_AMOUNT_MIN_CENTS + integer(RANDOM_AMOUNT_SPREAD_CENTS),
    dueDate,
    referenceDate: addDays(
      dueDate,
      RANDOM_REFERENCE_OFFSET_MIN_DAYS + integer(RANDOM_REFERENCE_OFFSET_SPREAD_DAYS),
    ),
    paid: random() < 0.6,
    planType: random() < 0.3 ? 'yearly' : 'monthly',
    failedAttempts: integer(RANDOM_MAX_FAILED_ATTEMPTS + 1),
  };
};

export const generateCharges = (count: number, seed: number, runId: string): GeneratedCharge[] => {
  const random = mulberry32(seed);
  return Array.from({ length: count }, (_, index) => ({
    messageId: `${runId}_${index}`,
    chargeId: `ch_${runId}_${index}`,
    ...(fixedTemplates[index] ?? randomTemplate(random)),
  }));
};

export const generateInvalidBodies = (count: number, runId: string): string[] =>
  Array.from({ length: count }, (_, index) =>
    index % 2 === 0 ? `{"broken":"${runId}_${index}` : JSON.stringify({ chargeId: `ch_${runId}_${index}` }),
  );
