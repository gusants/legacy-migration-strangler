export type ResultsDestination = 'official' | 'shadow';

export type DestinationResolution = { destination: ResultsDestination } | { invalidReason: string };

const ROUTING_ROLE_ATTRIBUTE = 'routingRole';

const DESTINATION_BY_ROLE = new Map<string, ResultsDestination>([
  ['primary', 'official'],
  ['shadow', 'shadow'],
]);

export const resolveDestination = (attributes: Readonly<Record<string, string>>): DestinationResolution => {
  const role = attributes[ROUTING_ROLE_ATTRIBUTE];
  if (role === undefined) return { invalidReason: `missing ${ROUTING_ROLE_ATTRIBUTE} attribute` };
  const destination = DESTINATION_BY_ROLE.get(role);
  return destination ? { destination } : { invalidReason: `unknown ${ROUTING_ROLE_ATTRIBUTE} "${role}"` };
};
