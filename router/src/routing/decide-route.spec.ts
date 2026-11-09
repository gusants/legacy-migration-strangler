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

  it('keeps legacy as the primary and sends a shadow copy to the new queue in shadow mode', () => {
    expect(decideRoute(message, { mode: 'shadow' })).toEqual({
      mode: 'shadow',
      targets: [
        { queue: 'legacy', role: 'primary' },
        { queue: 'new', role: 'shadow' },
      ],
    });
  });

  it.each<RoutingConfig>([
    { mode: 'percentage', newTrafficPercent: 10 },
    { mode: 'new' },
  ])('fails explicitly in $mode mode instead of falling back to legacy', (config) => {
    expect(() => decideRoute(message, config)).toThrow(UnsupportedRoutingModeError);
    expect(() => decideRoute(message, config)).toThrow(`"${config.mode}" is not implemented`);
  });
});
