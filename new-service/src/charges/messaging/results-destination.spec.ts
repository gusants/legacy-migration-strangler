import { resolveDestination } from './results-destination.js';

describe('resolveDestination', () => {
  it('sends the primary role to the official results', () => {
    expect(resolveDestination({ routingRole: 'primary' })).toEqual({ destination: 'official' });
  });

  it('sends the shadow role to the shadow results', () => {
    expect(resolveDestination({ routingRole: 'shadow' })).toEqual({ destination: 'shadow' });
  });

  it('ignores the legacy shadow flag: only the role decides', () => {
    expect(resolveDestination({ routingRole: 'primary', shadow: 'true' })).toEqual({ destination: 'official' });
  });

  it.each([
    ['no attributes', {}, 'missing routingRole attribute'],
    ['only the legacy shadow flag', { shadow: 'true', routingMode: 'shadow' }, 'missing routingRole attribute'],
    ['an unknown role', { routingRole: 'audit' }, 'unknown routingRole "audit"'],
    ['a role in the wrong case', { routingRole: 'Primary' }, 'unknown routingRole "Primary"'],
    ['an empty role', { routingRole: '' }, 'unknown routingRole ""'],
    ['an inherited property name', { routingRole: 'constructor' }, 'unknown routingRole "constructor"'],
  ])('rejects %s instead of picking a destination', (_name, attributes, reason) => {
    expect(resolveDestination(attributes)).toEqual({ invalidReason: reason });
  });
});
