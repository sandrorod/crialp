import { describe, expect, it } from 'vitest';
import { applyQuickReply, matchQuickReplies, shortcutAt } from './quickReplies';

describe('shortcutAt', () => {
  it('"/" no começo do texto ou de uma palavra', () => {
    expect(shortcutAt('/val', 4)).toEqual({ start: 0, query: 'val' });
    expect(shortcutAt('Olá /Valor', 10)).toEqual({ start: 4, query: 'valor' });
    expect(shortcutAt('linha 1\n/pix', 12)).toEqual({ start: 8, query: 'pix' });
    expect(shortcutAt('/', 1)).toEqual({ start: 0, query: '' });
  });

  it('ignora barra no meio de palavra (datas, links) e atalho já terminado', () => {
    expect(shortcutAt('dia 10/12', 9)).toBeNull();
    expect(shortcutAt('site.com/valor', 14)).toBeNull();
    expect(shortcutAt('/valor ', 7)).toBeNull();
    expect(shortcutAt('sem barra', 9)).toBeNull();
  });

  it('usa o texto antes do cursor (cursor no meio)', () => {
    expect(shortcutAt('/va e mais texto', 3)).toEqual({ start: 0, query: 'va' });
  });
});

describe('matchQuickReplies', () => {
  const list = [{ shortcut: 'agradecimento' }, { shortcut: 'pix' }, { shortcut: 'valor' }, { shortcut: 'valor-anual' }, { shortcut: 'novo-valor' }];

  it('começa com o digitado primeiro, depois os que contêm', () => {
    expect(matchQuickReplies(list, 'val').map((r) => r.shortcut)).toEqual(['valor', 'valor-anual', 'novo-valor']);
  });

  it('sem nada digitado mostra todas (até o limite); maiúsculas não importam', () => {
    expect(matchQuickReplies(list, '', 3)).toHaveLength(3);
    expect(matchQuickReplies(list, 'PIX').map((r) => r.shortcut)).toEqual(['pix']);
    expect(matchQuickReplies(list, 'xyz')).toEqual([]);
  });
});

describe('applyQuickReply', () => {
  it('troca o atalho pelo texto e põe o cursor no fim do texto inserido', () => {
    expect(applyQuickReply('Olá /val', 4, 8, 'R$ 99,90')).toEqual({ text: 'Olá R$ 99,90', cursor: 12 });
  });

  it('mantém o que vinha depois do cursor', () => {
    expect(applyQuickReply('/va obrigado', 0, 3, 'Valor: R$ 10')).toEqual({ text: 'Valor: R$ 10 obrigado', cursor: 12 });
  });
});
