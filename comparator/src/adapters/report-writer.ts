import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { reportBaseName } from '../cli/report-files.js';
import { renderMarkdown } from '../report/render-markdown.js';
import type { Report } from '../report/report.js';
import type { Verdict } from '../report/verdict.js';

export const writeReportFiles = async (
  directory: string,
  report: Report,
  verdict: Verdict,
): Promise<{ markdownPath: string; jsonPath: string }> => {
  await mkdir(directory, { recursive: true });
  const base = join(directory, reportBaseName(report));
  const markdownPath = `${base}.md`;
  const jsonPath = `${base}.json`;
  await Promise.all([
    writeFile(markdownPath, renderMarkdown(report, verdict)),
    writeFile(jsonPath, `${JSON.stringify({ ...report, verdict }, null, 2)}\n`),
  ]);
  return { markdownPath, jsonPath };
};
