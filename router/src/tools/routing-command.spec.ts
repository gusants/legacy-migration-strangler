import { parseRoutingCommand } from './routing-command.js';

describe('parseRoutingCommand', () => {
  it('builds a mode-only candidate', () => {
    expect(parseRoutingCommand(['shadow'])).toEqual({ mode: 'shadow' });
  });

  it('builds a percentage candidate with a numeric percentage', () => {
    expect(parseRoutingCommand(['percentage', '10'])).toEqual({ mode: 'percentage', newTrafficPercent: 10 });
  });

  it.each([[[]], [['percentage']], [['percentage', ' ']]])('leaves the percentage undefined for %j so the schema refuses it', (argv) => {
    expect(parseRoutingCommand(argv)).not.toHaveProperty('newTrafficPercent', expect.any(Number));
  });

  it('keeps a non-numeric percentage as NaN so the schema refuses it', () => {
    expect(parseRoutingCommand(['percentage', 'ten'])).toEqual({ mode: 'percentage', newTrafficPercent: Number.NaN });
  });

  it('refuses a percentage on a mode that takes none', () => {
    expect(() => parseRoutingCommand(['legacy', '10'])).toThrow('mode "legacy" takes no percentage');
  });

  it('refuses extra arguments', () => {
    expect(() => parseRoutingCommand(['percentage', '10', 'x'])).toThrow('expected: <mode> [percent]');
  });
});
