import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeRoutingConfigAtomically } from './routing-config-writer.js';

describe('writeRoutingConfigAtomically', () => {
  let directory: string;
  let path: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'routing-writer-'));
    path = join(directory, 'routing.json');
    await writeFile(path, '{"mode":"legacy"}');
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('replaces the file with the validated config and leaves no temporary file behind', async () => {
    await writeFile(path, '{broken');

    await expect(writeRoutingConfigAtomically(path, { mode: 'legacy' })).resolves.toEqual({ mode: 'legacy' });

    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ mode: 'legacy' });
    expect(await readdir(directory)).toEqual(['routing.json']);
  });

  it('accepts the shadow mode', async () => {
    await expect(writeRoutingConfigAtomically(path, { mode: 'shadow' })).resolves.toEqual({ mode: 'shadow' });

    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ mode: 'shadow' });
  });

  it.each([
    ['an unknown mode', { mode: 'canary' }],
    ['a declared but unimplemented mode', { mode: 'new' }],
    ['a missing mode', {}],
  ])('refuses %s and keeps the current file untouched', async (_name, candidate) => {
    await expect(writeRoutingConfigAtomically(path, candidate)).rejects.toThrow();

    expect(await readFile(path, 'utf8')).toBe('{"mode":"legacy"}');
    expect(await readdir(directory)).toEqual(['routing.json']);
  });

  it('cleans up the temporary file when the target cannot be replaced', async () => {
    await expect(
      writeRoutingConfigAtomically(join(directory, 'missing', 'routing.json'), { mode: 'legacy' }),
    ).rejects.toThrow();

    expect(await readdir(directory)).toEqual(['routing.json']);
  });
});
