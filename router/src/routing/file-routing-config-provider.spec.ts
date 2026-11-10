import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileRoutingConfigProvider } from './file-routing-config-provider.js';
import { RoutingConfigError } from './routing-errors.js';

describe('FileRoutingConfigProvider', () => {
  let directory: string;
  let path: string;
  let provider: FileRoutingConfigProvider;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'routing-'));
    path = join(directory, 'routing.json');
    provider = new FileRoutingConfigProvider(path);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('loads a valid config', async () => {
    await writeFile(path, '{"mode":"legacy"}');

    await expect(provider.load()).resolves.toEqual({ mode: 'legacy' });
  });

  it('rereads the file on every load', async () => {
    await writeFile(path, '{"mode":"legacy"}');
    await provider.load();
    await writeFile(path, '{"mode":"canary"}');

    await expect(provider.load()).rejects.toThrow('invalid routing config');
  });

  it('fails when the file does not exist', async () => {
    await expect(provider.load()).rejects.toThrow(RoutingConfigError);
    await expect(provider.load()).rejects.toThrow(`cannot read routing config at ${path}`);
  });

  it('fails when the file is not JSON', async () => {
    await writeFile(path, '{mode: legacy');

    await expect(provider.load()).rejects.toThrow('is not valid JSON');
  });

  it('loads the new mode', async () => {
    await writeFile(path, '{"mode":"new"}');

    await expect(provider.load()).resolves.toEqual({ mode: 'new' });
  });

  it('loads the percentage mode with its integer percentage', async () => {
    await writeFile(path, '{"mode":"percentage","newTrafficPercent":10}');

    await expect(provider.load()).resolves.toEqual({ mode: 'percentage', newTrafficPercent: 10 });
  });

  it.each([
    ['unknown mode', '{"mode":"canary"}'],
    ['missing mode', '{}'],
    ['percentage mode without the percentage', '{"mode":"percentage"}'],
    ['a percentage above 100', '{"mode":"percentage","newTrafficPercent":101}'],
    ['a negative percentage', '{"mode":"percentage","newTrafficPercent":-1}'],
    ['a fractional percentage', '{"mode":"percentage","newTrafficPercent":10.5}'],
    ['a string percentage', '{"mode":"percentage","newTrafficPercent":"10"}'],
    ['unexpected key in new mode', '{"mode":"new","newTrafficPercent":10}'],
    ['unexpected key', '{"mode":"legacy","newTrafficPercent":10}'],
    ['unexpected key in shadow mode', '{"mode":"shadow","newTrafficPercent":10}'],
  ])('fails on %s', async (_name, content) => {
    await writeFile(path, content);

    await expect(provider.load()).rejects.toThrow(`invalid routing config at ${path}`);
  });
});
