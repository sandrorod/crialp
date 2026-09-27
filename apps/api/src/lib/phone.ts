/** Remove tudo que não for dígito. */
export function digitsOnly(value: string | null | undefined): string {
  return (value ?? '').replace(/\D+/g, '');
}

/** Normaliza para o formato internacional brasileiro (55 + DDD + número) ou null. */
export function toBrazilE164Digits(value: string | null | undefined): string | null {
  let d = digitsOnly(value);
  if (!d) return null;
  d = d.replace(/^0+/, ''); // prefixo de operadora / zero à esquerda
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!d.startsWith('55') || (d.length !== 12 && d.length !== 13)) return null;
  return d;
}

/** Celular brasileiro: DDD + 9 + 8 dígitos. */
export function isBrazilMobile(value: string | null | undefined): boolean {
  const d = toBrazilE164Digits(value);
  return !!d && d.length === 13 && d[4] === '9';
}

/**
 * Link do WhatsApp. Usa o WhatsApp informado; se não houver, usa um celular
 * compatível. Nunca inventa números — retorna null se nada for válido.
 */
export function whatsappLink(whatsapp?: string | null, fallbackMobile?: string | null, message?: string) {
  const candidates = [whatsapp, fallbackMobile];
  for (const c of candidates) {
    const d = toBrazilE164Digits(c);
    if (!d) continue;
    if (c === fallbackMobile && !isBrazilMobile(c)) continue;
    const text = message ? `?text=${encodeURIComponent(message)}` : '';
    return `https://wa.me/${d}${text}`;
  }
  return null;
}

/** (11) 99999-9999 */
export function formatBrazilPhone(value: string | null | undefined): string {
  const d = toBrazilE164Digits(value);
  if (!d) return value ?? '';
  const local = d.slice(2);
  const ddd = local.slice(0, 2);
  const rest = local.slice(2);
  return rest.length === 9
    ? `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`
    : `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

export function telLink(value: string | null | undefined): string | null {
  const d = toBrazilE164Digits(value);
  if (d) return `tel:+${d}`;
  const raw = digitsOnly(value);
  return raw.length >= 8 ? `tel:${raw}` : null;
}
