import { readFile } from 'node:fs/promises';
import { parseKnownDivergences, type KnownDivergence } from '../domain/known-divergence.js';

export const loadKnownDivergences = async (path: string): Promise<KnownDivergence[]> =>
  parseKnownDivergences(JSON.parse(await readFile(path, 'utf8')));
