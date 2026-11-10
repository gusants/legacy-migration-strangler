import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exactlyOnceReportBaseName } from '../cli/report-files.js';
import type { ExactlyOnceReport } from '../report/exactly-once-report.js';
import { renderExactlyOnceMarkdown } from '../report/render-exactly-once.js';
import type { Verdict } from '../report/verdict.js';

export const writeExactlyOnceReportFiles = async (
  directory: string,
  report: ExactlyOnceReport,
  verdict: Verdict,
): Promise<{ markdownPath: string; jsonPath: string }> => {
  await mkdir(directory, { recursive: true });
  const base = join(directory, exactlyOnceReportBaseName(report.scope.runId));
  const markdownPath = `${base}.md`;
  const jsonPath = `${base}.json`;
  await Promise.all([
    writeFile(markdownPath, renderExactlyOnceMarkdown(report, verdict)),
    writeFile(jsonPath, `${JSON.stringify({ ...report, verdict }, null, 2)}\n`),
  ]);
  return { markdownPath, jsonPath };
};
