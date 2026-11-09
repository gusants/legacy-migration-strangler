import type { Report } from '../report/report.js';

const TIMESTAMP_UNSAFE_CHARACTERS = /[:.]/g;

export const reportBaseName = ({ scope, generatedAt }: Report): string =>
  `shadow-${'runId' in scope ? scope.runId : generatedAt.replace(TIMESTAMP_UNSAFE_CHARACTERS, '-')}`;
