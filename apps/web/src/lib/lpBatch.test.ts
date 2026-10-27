import { beforeEach, describe, expect, it } from 'vitest';
import { GAP_DEFAULT, GAP_MAX, loadGap, saveGap } from './lpBatch';

beforeEach(() => {
  localStorage.clear();
});

describe('intervalo entre LPs', () => {
  it('padrão quando nunca escolhido', () => {
    expect(loadGap()).toBe(GAP_DEFAULT);
  });

  it('lembra o escolhido, arredondado e dentro do limite', () => {
    saveGap(7.4);
    expect(loadGap()).toBe(7);
    saveGap(999);
    expect(loadGap()).toBe(GAP_MAX);
    saveGap(-5);
    expect(loadGap()).toBe(0);
  });
});
