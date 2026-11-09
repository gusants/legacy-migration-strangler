import { destinationOf } from './results-destination.js';

describe('destinationOf', () => {
  it('sends messages marked shadow=true to the shadow results', () => {
    expect(destinationOf({ shadow: 'true', routingMode: 'shadow' })).toBe('shadow');
  });

  it.each([
    ['no attributes', {}],
    ['other attributes only', { routingMode: 'new' }],
    ['shadow set to anything but true', { shadow: 'false' }],
  ])('sends messages with %s to the official results', (_name, attributes) => {
    expect(destinationOf(attributes)).toBe('official');
  });
});
