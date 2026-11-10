const toPercent = (raw: string | undefined): number | undefined =>
  raw === undefined || raw.trim() === '' ? undefined : Number(raw);

export const parseRoutingCommand = (argv: readonly string[]): unknown => {
  const [mode, percent, ...rest] = argv;
  if (rest.length > 0) {
    throw new Error('expected: <mode> [percent]');
  }
  if (mode === 'percentage') {
    return { mode, newTrafficPercent: toPercent(percent) };
  }
  if (percent !== undefined) {
    throw new Error(`mode "${mode}" takes no percentage`);
  }
  return { mode };
};
