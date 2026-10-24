import { describe, expect, it } from 'vitest';
import { normalizeLinkUrl, richToHtml, serializeRich } from './richText';

describe('richToHtml', () => {
  it('escapa o texto: HTML digitado não vira tag (sem XSS na prévia)', () => {
    expect(richToHtml('<img src=x onerror=alert(1)> & "aspas"')).toBe('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;aspas&quot;');
  });

  it('converte negrito, itálico, sublinhado, cor e tamanho', () => {
    expect(richToHtml('[[b]]forte[[/b]] [[i]]it[[/i]] [[u]]sub[[/u]]')).toBe('<strong>forte</strong> <em>it</em> <u>sub</u>');
    expect(richToHtml('[[c=#FF0000]]x[[/c]]')).toBe('<span style="color:#ff0000">x</span>');
    expect(richToHtml('[[s=18]]x[[/s]]')).toBe('<span style="font-size:18px">x</span>');
  });

  it('ignora tamanho fora do limite e cor inválida', () => {
    expect(richToHtml('[[s=500]]x[[/s]]')).toBe('x');
    expect(richToHtml('[[c=red]]x[[/c]]')).toBe('[[c=red]]x');
  });

  it('fecha formatação que ficou aberta e reabre a interna ao fechar fora de ordem', () => {
    expect(richToHtml('[[b]]sem fim')).toBe('<strong>sem fim</strong>');
    expect(richToHtml('[[b]]a[[i]]b[[/b]]c[[/i]]')).toBe('<strong>a<em>b</em></strong><em>c</em>');
  });

  it('link só para http(s), e-mail e telefone; nova aba com noopener', () => {
    expect(richToHtml('[[a=un|https://site.com.br]]site[[/a]]')).toBe(
      '<a href="https://site.com.br" target="_blank" rel="noopener noreferrer" style="text-decoration:underline;color:inherit">site</a>',
    );
    expect(richToHtml('[[a=xs|mailto:a@b.com]]mail[[/a]]')).toBe('<a href="mailto:a@b.com" style="text-decoration:none;color:inherit">mail</a>');
    expect(richToHtml('[[a=un|javascript:alert(1)]]x[[/a]]')).toBe('x');
  });

  it('quebra de linha vira <br>', () => {
    expect(richToHtml('linha 1\nlinha 2')).toBe('linha 1<br>linha 2');
  });
});

describe('normalizeLinkUrl', () => {
  it.each([
    ['site.com.br', 'https://site.com.br'],
    ['  https://a.com/x?y=1  ', 'https://a.com/x?y=1'],
    ['contato@empresa.com', 'mailto:contato@empresa.com'],
    ['(11) 99999-0000', 'tel:11999990000'],
    ['+55 11 3333-4444', 'tel:+551133334444'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeLinkUrl(input)).toBe(expected);
  });

  it('recusa o que não é link', () => {
    expect(normalizeLinkUrl('')).toBeNull();
    expect(normalizeLinkUrl('texto qualquer')).toBeNull();
    expect(normalizeLinkUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('serializeRich', () => {
  const html = (s: string) => {
    const div = document.createElement('div');
    div.innerHTML = s;
    return div;
  };

  it('lê o texto editado de volta para os códigos', () => {
    expect(serializeRich(html('<b>forte</b> e <i>itálico</i>'))).toBe('[[b]]forte[[/b]] e [[i]]itálico[[/i]]');
    expect(serializeRich(html('<span style="color: rgb(255, 0, 0)">x</span>'))).toBe('[[c=#ff0000]]x[[/c]]');
  });

  it('ida e volta mantém o mesmo texto', () => {
    const text = '[[b]]Olá[[/b]] [[u]]mundo[[/u]]';
    expect(serializeRich(html(richToHtml(text)))).toBe(text);
  });

  it('<br> e blocos viram quebra de linha; elementos da interface do editor ficam de fora', () => {
    expect(serializeRich(html('a<br>b'))).toBe('a\nb');
    expect(serializeRich(html('a<div>b</div>'))).toBe('a\nb');
    expect(serializeRich(html('texto<span data-lp-ui="1">botão</span>'))).toBe('texto');
  });

  it('não guarda link com protocolo perigoso', () => {
    expect(serializeRich(html('<a href="javascript:alert(1)">x</a>'))).toBe('x');
  });
});
