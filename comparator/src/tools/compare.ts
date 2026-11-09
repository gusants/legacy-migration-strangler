import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadKnownDivergences } from '../adapters/known-divergences-file.js';
import { MariaDbLegacyReader } from '../adapters/mariadb-legacy-reader.js';
import { PostgresShadowReader } from '../adapters/postgres-shadow-reader.js';
import { writeReportFiles } from '../adapters/report-writer.js';
import { runComparison } from '../application/run-comparison.js';
import { exitCodeOf, type Verdict } from '../report/verdict.js';
import { parseCompareOptions } from '../cli/compare-options.js';
import { loadDatabaseEnvironment } from '../cli/database-environment.js';

const ENV_FILE = fileURLToPath(new URL('../../../.env', import.meta.url));
const KNOWN_DIVERGENCES_FILE = fileURLToPath(new URL('../../known-divergences.json', import.meta.url));
const REPORTS_DIRECTORY = fileURLToPath(new URL('../../../reports', import.meta.url));

const ABORTED_EXIT_CODE = 3;

const resultLine = ({ status, failures }: Verdict): string =>
  failures.length === 0 ? `RESULT: ${status}` : `RESULT: ${status}: ${failures.join('; ')}`;

const compare = async (): Promise<number> => {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const options = parseCompareOptions(process.argv.slice(2));
  const databases = loadDatabaseEnvironment(process.env);
  const { report, verdict } = await runComparison(
    {
      legacyReader: new MariaDbLegacyReader(databases.legacy),
      shadowReader: new PostgresShadowReader(databases.shadow, 'charge_results_shadow'),
      knownDivergences: await loadKnownDivergences(KNOWN_DIVERGENCES_FILE),
      now: () => new Date(),
    },
    options,
  );
  const { markdownPath, jsonPath } = await writeReportFiles(REPORTS_DIRECTORY, report, verdict);
  process.stdout.write(
    `${JSON.stringify(report.totals)}\nreport: ${markdownPath}\nreport: ${jsonPath}\n${
      resultLine(verdict)
    }\n`,
  );
  return exitCodeOf(verdict);
};

try {
  process.exit(await compare());
} catch (error) {
  process.stderr.write(`compare aborted: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(ABORTED_EXIT_CODE);
}
