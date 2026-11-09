import { isFlowIntact, judgeFlow } from './flow-verdict.js';

describe('flow verdict', () => {
  it('accepts exactly the expected ids', () => {
    expect(isFlowIntact(judgeFlow(['a', 'b'], ['b', 'a']))).toBe(true);
  });

  it('reports lost messages', () => {
    const verdict = judgeFlow(['a', 'b', 'c'], ['a']);

    expect(verdict.missing).toEqual(['b', 'c']);
    expect(isFlowIntact(verdict)).toBe(false);
  });

  it('reports duplicated rows', () => {
    const verdict = judgeFlow(['a'], ['a', 'a']);

    expect(verdict).toMatchObject({ rows: 2, distinct: 1 });
    expect(isFlowIntact(verdict)).toBe(false);
  });

  it('reports ids nobody asked for', () => {
    const verdict = judgeFlow(['a'], ['a', 'z']);

    expect(verdict.unexpected).toEqual(['z']);
    expect(isFlowIntact(verdict)).toBe(false);
  });
});
