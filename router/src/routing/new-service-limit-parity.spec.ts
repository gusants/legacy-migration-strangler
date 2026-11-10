import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NEW_SERVICE_MAX_AMOUNT_CENTS } from './decide-route.js';

const fromRepositoryRoot = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)), 'utf8');

type DivergenceRule = { id: string; when: { right?: { value?: number } } };

const amountLimitInNewService = (): number => {
  const source = fromRepositoryRoot('new-service/src/charges/http/charge-message.schema.ts');
  const literal = /export const MAX_AMOUNT_CENTS = ([\d_]+);/.exec(source)?.[1];
  return Number((literal ?? '').replaceAll('_', ''));
};

const amountLimitInKnownDivergences = (): number | undefined => {
  const rules = JSON.parse(fromRepositoryRoot('comparator/known-divergences.json')) as DivergenceRule[];
  return rules.find(({ id }) => id === 'C1')?.when.right?.value;
};

describe('the amount limit the router keeps off the new service', () => {
  it('is the limit the new service enforces', () => {
    expect(amountLimitInNewService()).toBe(NEW_SERVICE_MAX_AMOUNT_CENTS);
  });

  it('is the limit rule C1 of the known divergences expects', () => {
    expect(amountLimitInKnownDivergences()).toBe(NEW_SERVICE_MAX_AMOUNT_CENTS);
  });
});
