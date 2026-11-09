import type { Report } from '../report/report.js';

const TIMESTAMP_UNSAFE_CHARACTERS = /[:.]/g;
const FILE_SAFE_RUN_ID = /^[A-Za-z0-9_-]+$/;

export const fileSafeRunId = (runId: string): string => {
  if (!FILE_SAFE_RUN_ID.test(runId)) throw new Error('run id must contain only letters, digits, "_" and "-"');
  return runId;
};

export const reportBaseName = ({ scope, generatedAt }: Report): string =>
  `shadow-${'runId' in scope ? fileSafeRunId(scope.runId) : generatedAt.replace(TIMESTAMP_UNSAFE_CHARACTERS, '-')}`;
