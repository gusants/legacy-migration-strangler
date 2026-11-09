export type FlowVerdict = {
  expected: number;
  distinct: number;
  rows: number;
  missing: string[];
  unexpected: string[];
};

export const judgeFlow = (expectedIds: readonly string[], storedIds: readonly string[]): FlowVerdict => {
  const expected = new Set(expectedIds);
  const stored = new Set(storedIds);
  return {
    expected: expected.size,
    distinct: stored.size,
    rows: storedIds.length,
    missing: expectedIds.filter((id) => !stored.has(id)),
    unexpected: [...stored].filter((id) => !expected.has(id)),
  };
};

export const isFlowIntact = (verdict: FlowVerdict): boolean =>
  verdict.missing.length === 0 &&
  verdict.unexpected.length === 0 &&
  verdict.rows === verdict.distinct;
