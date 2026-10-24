import { describe, expect, it } from 'vitest';
import { tonesOf } from './colorTones';

describe('tonesOf', () => {
  it('8 tons, do mais claro ao mais escuro, com a cor pura no meio', () => {
    const t = tonesOf('#1D4ED8');
    expect(t).toHaveLength(8);
    expect(t[4]).toBe('#1d4ed8');
    expect(t[0]).toBe('#edf1fc');
    expect(t[7]).toBe('#08163c');
  });

  it('cor inválida não gera tons', () => {
    expect(tonesOf('azul')).toEqual([]);
    expect(tonesOf('#fff')).toEqual([]);
  });
});
