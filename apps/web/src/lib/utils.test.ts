import { afterEach, describe, expect, it, vi } from 'vitest';
import { cn, formatDate, formatPrice, relativeTime, shortUrl } from './utils';

describe('cn', () => {
  it('junta só as classes válidas', () => {
    expect(cn('a', false, null, undefined, 'b', '')).toBe('a b');
  });
});

describe('formatDate', () => {
  it('data em pt-BR e traço quando vazia', () => {
    expect(formatDate('2026-10-24T15:30:00')).toBe('24/10/2026');
    expect(formatDate('2026-10-24T15:30:00', true)).toBe('24/10/2026, 15:30');
    expect(formatDate(null)).toBe('—');
  });
});

describe('relativeTime', () => {
  afterEach(() => vi.useRealTimers());

  it('agora, minutos, horas, dias e data completa depois de 30 dias', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T12:00:00'));
    expect(relativeTime('2026-10-24T11:59:30')).toBe('agora');
    expect(relativeTime('2026-10-24T11:45:00')).toBe('há 15 min');
    expect(relativeTime('2026-10-24T09:00:00')).toBe('há 3 h');
    expect(relativeTime('2026-10-21T12:00:00')).toBe('há 3 dia(s)');
    expect(relativeTime('2026-08-01T12:00:00')).toBe('01/08/2026');
  });
});

describe('shortUrl', () => {
  it('tira protocolo, www e barra final', () => {
    expect(shortUrl('https://www.padaria.com.br/')).toBe('padaria.com.br');
  });

  it('link do Google Maps mostra só o nome do lugar', () => {
    expect(shortUrl('https://www.google.com/maps/search/?api=1&query=Padaria%20Central%2C%20Rua%20A')).toBe('Google Maps · Padaria Central');
  });

  it('link longo fica com reticências no meio, no tamanho pedido', () => {
    const s = shortUrl(`https://site.com/${'a'.repeat(80)}`, 30);
    expect(s).toHaveLength(30);
    expect(s).toContain('…');
    expect(s.startsWith('site.com/')).toBe(true);
  });

  it('vazio fica vazio', () => {
    expect(shortUrl(null)).toBe('');
  });
});

describe('formatPrice', () => {
  it('reais em pt-BR; sem preço = null', () => {
    expect(formatPrice(1234.5)?.replace(/\s/g, ' ')).toBe('R$ 1.234,50');
    expect(formatPrice(null)).toBeNull();
  });
});
