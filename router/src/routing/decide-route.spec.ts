import { decideRoute } from './decide-route.js';
import type { RoutingConfig } from './routing-config.js';
import { UnsupportedRoutingModeError } from './routing-errors.js';

const message = { messageId: 'msg-1', chargeId: 'ch-1' };

describe('decideRoute', () => {
  it('sends everything to the legacy queue in legacy mode', () => {
    expect(decideRoute(message, { mode: 'legacy' })).toEqual({
      mode: 'legacy',
      targets: [{ queue: 'legacy', role: 'primary' }],
    });
  });

  it.each<RoutingConfig>([
    { mode: 'shadow' },
    { mode: 'percentage', newTrafficPercent: 10 },
    { mode: 'new' },
  ])('fails explicitly in $mode mode instead of falling back to legacy', (config) => {
    expect(() => decideRoute(message, config)).toThrow(UnsupportedRoutingModeError);
    expect(() => decideRoute(message, config)).toThrow(`"${config.mode}" is not implemented`);
  });
});
