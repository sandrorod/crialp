import { describe, expect, it } from 'vitest';
import { imageStylesCss, setImageStyleCss } from './imageStyle';

const URL_A = 'https://site.com/foto.jpg';

describe('imageStylesCss (mesmo CSS da página publicada)', () => {
  it('sem estilo, sem CSS', () => {
    expect(imageStylesCss(undefined, undefined)).toBe('');
    expect(imageStylesCss({ [URL_A]: {} }, undefined)).toBe('');
  });

  it('borda, cantos e sombra vão na moldura da foto', () => {
    const css = imageStylesCss({ [URL_A]: { bw: 4, bc: '#ff0000', r: 12, sh: 'md' } }, undefined);
    expect(css).toBe(
      `:has(>img[data-lp-img="${URL_A}"]){border:4px solid #ff0000!important;border-radius:12px!important;box-shadow:0 12px 30px rgba(0,0,0,0.26)!important}`,
    );
  });

  it('foto afastada (zoom < 1): estilo na própria foto, medidas divididas pelo zoom, moldura sem fundo', () => {
    const css = imageStylesCss({ [URL_A]: { bw: 4 } }, { [URL_A]: { x: 50, y: 50, z: 0.5 } });
    expect(css).toContain('{background:transparent!important;box-shadow:none!important}');
    expect(css).toContain(`img[data-lp-img="${URL_A}"]{border:8px solid #ffffff!important}`);
  });

  it('filtro e giro', () => {
    const css = imageStylesCss({ [URL_A]: { fx: 'gray', rot: 90, fh: true } }, undefined);
    expect(css).toContain('{filter:grayscale(1)}');
    expect(css).toContain('rotate(90deg) scale(calc(var(--lp-rk,1) * -1),var(--lp-rk,1))');
  });

  it('borda de link só quando a foto tem link', () => {
    expect(imageStylesCss({ [URL_A]: { lb: true } }, undefined)).toBe('');
    expect(imageStylesCss({ [URL_A]: { href: 'https://x.com', lb: true } }, undefined)).toContain('outline:3px solid var(--primary,#2563eb)!important');
  });

  it('endereço com aspas ou "<" não fecha o seletor nem o <style>', () => {
    const css = imageStylesCss({ ['https://x.com/a"b<script>.jpg']: { r: 4 } }, undefined);
    expect(css).toContain('img[data-lp-img="https://x.com/a\\"bscript.jpg"]');
    expect(css).not.toContain('<');
  });
});

describe('setImageStyleCss', () => {
  it('cria a tag de estilo uma vez e depois só troca o conteúdo', () => {
    setImageStyleCss(document, 'a{}');
    setImageStyleCss(document, 'b{}');
    const tags = document.querySelectorAll('#lp-image-style');
    expect(tags).toHaveLength(1);
    expect(tags[0].textContent).toBe('b{}');
  });
});
