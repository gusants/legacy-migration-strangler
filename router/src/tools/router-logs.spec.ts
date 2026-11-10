import { parseRoutedCopies } from './router-logs.js';

const routed = (messageId: string, role = 'primary', destination = 'legacy') =>
  JSON.stringify({ level: 'info', event: 'routed', messageId, chargeId: 'c', mode: 'percentage', destination, role });

describe('parseRoutedCopies', () => {
  it('collects every routed copy of the run with its role and destination, repeats included', () => {
    const logs = [
      routed('run1_0'),
      routed('run1_1', 'primary', 'new'),
      routed('run1_0', 'shadow', 'new'),
      routed('run1_0'),
      '',
    ].join('\n');

    expect(parseRoutedCopies(logs, 'run1_')).toEqual([
      { messageId: 'run1_0', chargeId: 'c', role: 'primary', destination: 'legacy' },
      { messageId: 'run1_1', chargeId: 'c', role: 'primary', destination: 'new' },
      { messageId: 'run1_0', chargeId: 'c', role: 'shadow', destination: 'new' },
      { messageId: 'run1_0', chargeId: 'c', role: 'primary', destination: 'legacy' },
    ]);
  });

  it('ignores other runs, other events, unknown roles or destinations and non-JSON lines', () => {
    const logs = [
      routed('other_0'),
      routed('run1_2', 'observer'),
      routed('run1_2', 'primary', 'mainframe'),
      JSON.stringify({ event: 'batch_done', messageId: 'run1_3', role: 'primary', destination: 'legacy' }),
      JSON.stringify({ event: 'routed', messageId: 7, role: 'primary', destination: 'legacy' }),
      JSON.stringify({ event: 'routed', messageId: 'run1_4', role: 'primary', destination: 'legacy' }),
      'not json {',
      'plain text',
      '{"event":"routed"',
    ].join('\n');

    expect(parseRoutedCopies(logs, 'run1_')).toEqual([]);
  });

  it('tolerates a compose log prefix before the JSON', () => {
    expect(parseRoutedCopies(`router-1  | ${routed('run1_0')}`, 'run1_')).toEqual([
      { messageId: 'run1_0', chargeId: 'c', role: 'primary', destination: 'legacy' },
    ]);
  });
});
