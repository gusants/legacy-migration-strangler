import { LastValidRoutingConfigResolver } from './last-valid-routing-config-resolver.js';
import type { RoutingConfig, RoutingConfigProvider } from './routing-config.js';

const scriptedProvider = (...steps: (RoutingConfig | Error | string)[]): RoutingConfigProvider => {
  const remaining = [...steps];
  return {
    load: async () => {
      const step = remaining.shift();
      if (step instanceof Error) throw step;
      if (typeof step === 'string') throw step;
      if (!step) throw new Error('script exhausted');
      return step;
    },
  };
};

describe('LastValidRoutingConfigResolver', () => {
  it('returns the loaded config without a fallback reason', async () => {
    const resolver = new LastValidRoutingConfigResolver(scriptedProvider({ mode: 'legacy' }));

    await expect(resolver.resolve()).resolves.toEqual({ config: { mode: 'legacy' } });
  });

  it('keeps serving the last valid config when a later load fails, and says why', async () => {
    const resolver = new LastValidRoutingConfigResolver(
      scriptedProvider({ mode: 'legacy' }, new Error('not valid JSON')),
    );
    await resolver.resolve();

    await expect(resolver.resolve()).resolves.toEqual({
      config: { mode: 'legacy' },
      fallbackReason: 'not valid JSON',
    });
  });

  it('describes non-Error failures in the fallback reason', async () => {
    const resolver = new LastValidRoutingConfigResolver(scriptedProvider({ mode: 'legacy' }, 'boom'));
    await resolver.resolve();

    await expect(resolver.resolve()).resolves.toMatchObject({ fallbackReason: 'boom' });
  });

  it('adopts a newer valid config after a failure', async () => {
    const resolver = new LastValidRoutingConfigResolver(
      scriptedProvider({ mode: 'legacy' }, new Error('broken'), { mode: 'legacy' }),
    );
    await resolver.resolve();
    await resolver.resolve();

    await expect(resolver.resolve()).resolves.toEqual({ config: { mode: 'legacy' } });
  });

  it('rethrows when there has never been a valid config', async () => {
    const resolver = new LastValidRoutingConfigResolver(scriptedProvider(new Error('missing file')));

    await expect(resolver.resolve()).rejects.toThrow('missing file');
  });
});
