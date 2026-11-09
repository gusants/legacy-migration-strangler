import { parseKnownDivergences, type KnownDivergence } from '../domain/known-divergence.js';
import knownDivergencesFile from '../../known-divergences.json' with { type: 'json' };

export const realKnownDivergences = (): KnownDivergence[] => parseKnownDivergences(knownDivergencesFile);
