import { parsePrimaryRoutedMessageIds } from './router-logs.js';

const routed = (messageId: string, role = 'primary') =>
  JSON.stringify({ level: 'info', event: 'routed', messageId, chargeId: 'c', mode: 'legacy', destination: 'legacy', role });

describe('parsePrimaryRoutedMessageIds', () => {
  it('collects one id per primary routed event of the run, repeats included', () => {
    const logs = [routed('run1_0'), routed('run1_1'), routed('run1_0'), ''].join('\n');

    expect(parsePrimaryRoutedMessageIds(logs, 'run1_')).toEqual(['run1_0', 'run1_1', 'run1_0']);
  });

  it('ignores other runs, shadow copies, other events and non-JSON lines', () => {
    const logs = [
      routed('other_0'),
      routed('run1_2', 'shadow'),
      JSON.stringify({ event: 'batch_done', messageId: 'run1_3' }),
      JSON.stringify({ event: 'routed', messageId: 7 }),
      'not json {',
      'plain text',
      '{"event":"routed"',
    ].join('\n');

    expect(parsePrimaryRoutedMessageIds(logs, 'run1_')).toEqual([]);
  });

  it('tolerates a compose log prefix before the JSON', () => {
    expect(parsePrimaryRoutedMessageIds(`router-1  | ${routed('run1_0')}`, 'run1_')).toEqual(['run1_0']);
  });
});
