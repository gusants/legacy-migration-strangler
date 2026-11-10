import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AnnouncedRejectionsReader } from '../application/ports.js';
import { parseAnnouncedRejections } from '../domain/announced-rejections.js';

const run = promisify(execFile);

const MAX_LOG_BYTES = 256 * 1024 * 1024;
const LOG_WINDOW = '6h';

export class RouterLogRejectionsReader implements AnnouncedRejectionsReader {
  constructor(private readonly repositoryRoot: string) {}

  async read(runId: string): Promise<string[]> {
    try {
      const { stdout } = await run(
        'docker',
        ['compose', 'logs', 'router', '--since', LOG_WINDOW, '--no-color', '--no-log-prefix'],
        { cwd: this.repositoryRoot, maxBuffer: MAX_LOG_BYTES },
      );
      return parseAnnouncedRejections(stdout, `${runId}_`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`cannot read the router logs through "docker compose logs router": ${reason}`);
    }
  }
}
