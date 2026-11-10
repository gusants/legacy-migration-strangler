import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MariaDbLegacyReader } from '../adapters/mariadb-legacy-reader.js';
import { PostgresRoutingLedgerReader } from '../adapters/postgres-routing-ledger-reader.js';
import { PostgresShadowReader } from '../adapters/postgres-shadow-reader.js';
import { RouterLogRejectionsReader } from '../adapters/router-log-rejections-reader.js';
import { writeExactlyOnceReportFiles } from '../adapters/exactly-once-report-writer.js';
import { runExactlyOnceAudit } from '../application/run-exactly-once-audit.js';
import { parseExactlyOnceOptions } from '../cli/exactly-once-options.js';
import { loadDatabaseEnvironment } from '../cli/database-environment.js';
import { exitCodeOf, type Verdict } from '../report/verdict.js';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ENV_FILE = fileURLToPath(new URL('../../../.env', import.meta.url));
const REPORTS_DIRECTORY = fileURLToPath(new URL('../../../reports', import.meta.url));

const ABORTED_EXIT_CODE = 3;

const resultLine = ({ status, failures }: Verdict): string =>
  failures.length === 0 ? `RESULT: ${status}` : `RESULT: ${status}: ${failures.join('; ')}`;

const audit = async (): Promise<number> => {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const options = parseExactlyOnceOptions(process.argv.slice(2));
  const databases = loadDatabaseEnvironment(process.env);
  const { report, verdict } = await runExactlyOnceAudit(
    {
      legacyOfficialReader: new MariaDbLegacyReader(databases.legacy),
      newOfficialReader: new PostgresShadowReader(databases.shadow, 'charge_results'),
      ledgerReader: new PostgresRoutingLedgerReader(databases.shadow),
      announcedRejectionsReader: new RouterLogRejectionsReader(REPOSITORY_ROOT),
      now: () => new Date(),
    },
    options,
  );
  const { markdownPath, jsonPath } = await writeExactlyOnceReportFiles(REPORTS_DIRECTORY, report, verdict);
  process.stdout.write(
    `${JSON.stringify(report.totals)}\nreport: ${markdownPath}\nreport: ${jsonPath}\n${resultLine(verdict)}\n`,
  );
  return exitCodeOf(verdict);
};

try {
  process.exit(await audit());
} catch (error) {
  process.stderr.write(`exactly-once aborted: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(ABORTED_EXIT_CODE);
}
