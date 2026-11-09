import { parseVerifyOptions } from './verify-options.js';

describe('parseVerifyOptions', () => {
  it('applies defaults', () => {
    expect(parseVerifyOptions([])).toEqual({ count: 200, invalid: 0, seed: 20_261_109, timeoutSeconds: 300 });
  });

  it('reads every option', () => {
    expect(parseVerifyOptions(['--count', '300', '--invalid', '3', '--seed', '7', '--timeout', '60'])).toEqual({
      count: 300,
      invalid: 3,
      seed: 7,
      timeoutSeconds: 60,
    });
  });

  it.each([
    ['--count', '0'],
    ['--count', '-5'],
    ['--count', '1.5'],
    ['--count', 'abc'],
    ['--count', ''],
    ['--invalid', '-1'],
    ['--invalid', '2.5'],
    ['--timeout', '0'],
    ['--seed', 'x'],
  ])('rejects %s %s', (flag, value) => {
    expect(() => parseVerifyOptions([`${flag}=${value}`])).toThrow(`${flag} must be an integer`);
  });
});
