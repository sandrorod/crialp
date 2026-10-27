import { beforeEach, describe, expect, it } from 'vitest';
import { GAP_DEFAULT, GAP_MAX, loadBatch, loadGap, saveBatch, saveGap } from './lpBatch';

const batch = {
  items: [
    { url: 'https://a.com', name: 'A' },
    { url: 'https://b.com', name: 'B' },
  ],
  index: 0,
  fotos: true,
  ok: 0,
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('lote de LPs', () => {
  it('guarda e lê o lote em andamento', () => {
    saveBatch(batch);
    expect(loadBatch()).toEqual(batch);
  });

  it('lote terminado (índice no fim) não volta', () => {
    saveBatch({ ...batch, index: 2 });
    expect(loadBatch()).toBeNull();
  });

  it('apagar o lote e conteúdo inválido no armazenamento', () => {
    saveBatch(batch);
    saveBatch(null);
    expect(loadBatch()).toBeNull();
    sessionStorage.setItem('lp:batch', '{inválido');
    expect(loadBatch()).toBeNull();
  });
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
