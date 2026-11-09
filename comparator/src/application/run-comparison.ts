import { compareResults } from '../domain/compare.js';
import type { KnownDivergence } from '../domain/known-divergence.js';
import { buildReport, type Report } from '../report/report.js';
import { judgeReport, type Verdict } from '../report/verdict.js';
import type { ResultsReader, Scope } from './ports.js';

export type ComparisonDependencies = {
  legacyReader: ResultsReader;
  shadowReader: ResultsReader;
  knownDivergences: readonly KnownDivergence[];
  now: () => Date;
};

export type ComparisonRequest = { scope: Scope; settleSeconds: number };

export type ComparisonResult = { report: Report; verdict: Verdict };

const reportScopeOf = (scope: Scope): Report['scope'] =>
  'runId' in scope ? { runId: scope.runId } : { since: scope.since.toISOString() };

export const runComparison = async (
  { legacyReader, shadowReader, knownDivergences, now }: ComparisonDependencies,
  { scope, settleSeconds }: ComparisonRequest,
): Promise<ComparisonResult> => {
  const [legacyRows, shadowRows] = await Promise.all([legacyReader.read(scope), shadowReader.read(scope)]);
  const comparedAt = now();
  const outcomes = compareResults({ legacyRows, shadowRows, now: comparedAt, settleSeconds, knownDivergences });
  const report = buildReport(outcomes, { generatedAt: comparedAt, scope: reportScopeOf(scope), settleSeconds });
  return { report, verdict: judgeReport(report) };
};
