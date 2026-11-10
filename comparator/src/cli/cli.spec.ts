import { RECORDED_AT } from '../testing/charge-result.test-support.js';
import { buildReport } from '../report/report.js';
import { parseCompareOptions } from './compare-options.js';
import { loadDatabaseEnvironment } from './database-environment.js';
import { exactlyOnceReportBaseName, reportBaseName } from './report-files.js';
import { parseExactlyOnceOptions } from './exactly-once-options.js';

describe('parseCompareOptions', () => {
  it('reads a run id with the default settle window', () => {
    expect(parseCompareOptions(['--run-id', 'abc'])).toEqual({ scope: { runId: 'abc' }, settleSeconds: 30 });
  });

  it('reads a since window and a custom settle window', () => {
    expect(parseCompareOptions(['--since', '2026-11-09T10:00:00Z', '--settle-seconds', '0'])).toEqual({
      scope: { since: new Date('2026-11-09T10:00:00Z') },
      settleSeconds: 0,
    });
  });

  it.each([[[]], [['--run-id', 'a', '--since', '2026-11-09']]])('requires exactly one scope: %j', (argv) => {
    expect(() => parseCompareOptions(argv)).toThrow('exactly one of --run-id or --since');
  });

  it('rejects a run id that is unsafe for a file name before reading any database', () => {
    expect(() => parseCompareOptions(['--run-id', '../x'])).toThrow('run id must contain only');
  });

  it('rejects an invalid date', () => {
    expect(() => parseCompareOptions(['--since', 'yesterday'])).toThrow('ISO-8601');
  });

  it.each(['-1', '1.5', 'x'])('rejects settle seconds %s', (value) => {
    expect(() => parseCompareOptions(['--run-id', 'a', `--settle-seconds=${value}`])).toThrow('non-negative integer');
  });
});

describe('loadDatabaseEnvironment', () => {
  it('defaults to the local compose databases', () => {
    expect(loadDatabaseEnvironment({})).toEqual({
      legacy: { host: '127.0.0.1', port: 3307, database: 'legacy', user: 'legacy', password: 'legacy' },
      shadow: { host: '127.0.0.1', port: 5433, database: 'charges', user: 'charges', password: 'charges' },
    });
  });

  it('reads overrides from the environment', () => {
    const { legacy, shadow } = loadDatabaseEnvironment({ LEGACY_DB_PORT: '4000', NEW_DB_HOST: 'db', NEW_DB_NAME: 'x' });

    expect(legacy.port).toBe(4000);
    expect(shadow).toMatchObject({ host: 'db', database: 'x' });
  });

  it('rejects an invalid port', () => {
    expect(() => loadDatabaseEnvironment({ NEW_DB_PORT: 'abc' })).toThrow();
  });
});

describe('reportBaseName', () => {
  const generatedAt = RECORDED_AT;

  it('uses the run id when there is one', () => {
    const report = buildReport([], { generatedAt, scope: { runId: 'run42' }, settleSeconds: 30 });

    expect(reportBaseName(report)).toBe('shadow-run42');
  });

  it.each(['../evil', 'a/b', 'a b', '', 'run.1'])('rejects the unsafe run id %j', (runId) => {
    const report = buildReport([], { generatedAt, scope: { runId }, settleSeconds: 30 });

    expect(() => reportBaseName(report)).toThrow('run id must contain only');
  });

  it('uses a file-safe timestamp for a since window', () => {
    const report = buildReport([], { generatedAt, scope: { since: 'x' }, settleSeconds: 30 });

    expect(reportBaseName(report)).toBe('shadow-2026-11-09T12-00-00-000Z');
  });
});

describe('parseExactlyOnceOptions', () => {
  it('reads the run id, the expected count and the default settle window', () => {
    expect(parseExactlyOnceOptions(['--run-id', 'abc', '--expected-count', '300'])).toEqual({
      runId: 'abc',
      expectedCount: 300,
      settleSeconds: 30,
    });
  });

  it('reads a custom settle window', () => {
    expect(parseExactlyOnceOptions(['--run-id', 'a', '--expected-count', '1', '--settle-seconds', '0']).settleSeconds).toBe(0);
  });

  it.each([
    [['--expected-count', '3'], '--run-id is required'],
    [['--run-id', 'a'], '--expected-count is required'],
    [['--run-id', 'a', '--expected-count', '0'], 'at least 1'],
    [['--run-id', 'a', '--expected-count', '1.5'], 'non-negative integer'],
    [['--run-id', 'a', '--expected-count', ' '], 'non-negative integer'],
    [['--run-id', 'a', '--expected-count', '1', '--settle-seconds=-1'], 'non-negative integer'],
    [['--run-id', '../x', '--expected-count', '1'], 'run id must contain only'],
  ])('rejects %j', (argv, message) => {
    expect(() => parseExactlyOnceOptions(argv)).toThrow(message);
  });
});

describe('exactlyOnceReportBaseName', () => {
  it('prefixes the safe run id', () => {
    expect(exactlyOnceReportBaseName('run42')).toBe('audit-run42');
  });

  it('rejects an unsafe run id', () => {
    expect(() => exactlyOnceReportBaseName('a/b')).toThrow('run id must contain only');
  });
});
