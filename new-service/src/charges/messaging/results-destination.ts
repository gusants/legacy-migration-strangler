export type ResultsDestination = 'official' | 'shadow';

const SHADOW_ATTRIBUTE = 'shadow';
const SHADOW_VALUE = 'true';

export const destinationOf = (attributes: Readonly<Record<string, string>>): ResultsDestination =>
  attributes[SHADOW_ATTRIBUTE] === SHADOW_VALUE ? 'shadow' : 'official';
