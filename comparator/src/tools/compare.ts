import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadKnownDivergences } from '../adapters/known-divergences-file.js';
import { MariaDbLegacyReader } from '../adapters/mariadb-legacy-reader.js';
import { PostgresShadowReader } from '../adapters/postgres-shadow-reader.js';
import { writeReportFiles } from '../adapters/report-writer.js';
import { runComparison } from '../application/run-comparison.js';
import { parseCompareOptions } from '../cli/compare-options.js';
import { loadDatabaseEnvironment } from '../cli/database-environment.js';

const ENV_FILE = fileURLToPath(new URL('../../../.env', import.meta.url));
const KNOWN_DIVERGENCES_FILE = fileURLToPath(new URL('../../known-divergences.json', import.meta.url));
const REPORTS_DIRECTORY = fileURLToPath(new URL('../../../reports', import.meta.url));

const compare = async (): Promise<boolean> => {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const options = parseCompareOptions(process.argv.slice(2));
  const databases = loadDatabaseEnvironment(process.env);
  const { report, verdict } = await runComparison(
    {
      legacyReader: new MariaDbLegacyReader(databases.legacy),
      shadowReader: new PostgresShadowReader(databases.shadow),
      knownDivergences: await loadKnownDivergences(KNOWN_DIVERGENCES_FILE),
      now: () => new Date(),
    },
    options,
  );
  const { markdownPath, jsonPath } = await writeReportFiles(REPORTS_DIRECTORY, report, verdict);
  process.stdout.write(
    `${JSON.stringify(report.totals)}\nreport: ${markdownPath}\nreport: ${jsonPath}\n${
      verdict.passed ? 'RESULT: OK no unexpected divergence' : `RESULT: FAILED: ${verdict.failures.join('; ')}`
    }\n`,
  );
  return verdict.passed;
};

try {
  process.exit((await compare()) ? 0 : 1);
} catch (error) {
  process.stderr.write(`compare aborted: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}
