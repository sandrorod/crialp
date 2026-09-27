import { digitsOnly, toBrazilE164Digits } from '../../lib/phone.js';
import type { ScrapeResult, SocialNetwork } from '../scraper/ScraperService.js';

/**
 * Verificação anti-invenção: cada dado factual extraído pela IA precisa estar
 * presente no material coletado. O que não puder ser confirmado é descartado.
 */
export class SourceVerifier {
  private readonly text: string;
  private readonly digits: string;
  readonly removed: string[] = [];

  constructor(private readonly scrape: ScrapeResult) {
    this.text = normalize(scrape.corpus);
    this.digits = digitsOnly(scrape.corpus);
  }

  private drop(label: string, value: string) {
    this.removed.push(`${label}: "${value}" (não encontrado na fonte)`);
    return null;
  }

  phone(value: string | null, label = 'Telefone'): string | null {
    if (!value) return null;
    const d = toBrazilE164Digits(value);
    if (!d) return this.drop(label, value);
    const known = [...this.scrape.found.phones, ...this.scrape.found.whatsapps];
    if (known.includes(d) || this.digits.includes(d.slice(4))) return value;
    return this.drop(label, value);
  }

  whatsapp(value: string | null): string | null {
    if (!value) return null;
    const d = toBrazilE164Digits(value);
    if (d && this.scrape.found.whatsapps.includes(d)) return value;
    if (d && this.text.includes('whatsapp') && this.digits.includes(d.slice(4))) return value;
    return this.drop('WhatsApp', value);
  }

  email(value: string | null): string | null {
    if (!value) return null;
    const v = value.trim().toLowerCase();
    if (this.scrape.found.emails.includes(v) || this.text.includes(v)) return v;
    return this.drop('E-mail', value);
  }

  zip(value: string | null): string | null {
    if (!value) return null;
    const d = digitsOnly(value);
    if (d.length === 8 && (this.scrape.found.zipCodes.includes(d) || this.digits.includes(d))) {
      return `${d.slice(0, 5)}-${d.slice(5)}`;
    }
    return this.drop('CEP', value);
  }

  /** Texto curto (cidade, bairro, razão social): precisa aparecer no material. */
  phrase(value: string | null, label: string): string | null {
    if (!value) return null;
    const n = normalize(value);
    if (n.length && this.text.includes(n)) return value;
    return this.drop(label, value);
  }

  /** Endereço: a maioria das palavras significativas precisa aparecer no material. */
  address(value: string | null): string | null {
    if (!value) return null;
    const tokens = normalize(value)
      .split(' ')
      .filter((t) => t.length > 3 && !['avenida', 'rua', 'travessa', 'alameda', 'rodovia'].includes(t));
    if (!tokens.length) return value;
    const hits = tokens.filter((t) => this.text.includes(t)).length;
    return hits / tokens.length >= 0.6 ? value : this.drop('Endereço', value);
  }

  number(value: string | null): string | null {
    if (!value) return null;
    const d = digitsOnly(value);
    if (!d || this.digits.includes(d)) return value;
    return this.drop('Número', value);
  }

  state(value: string | null): string | null {
    if (!value) return null;
    const uf = value.trim().toUpperCase();
    if (UFS.includes(uf)) return uf;
    return this.text.includes(normalize(value)) ? value : this.drop('Estado', value);
  }

  /** Redes sociais: precisam ter sido encontradas em links do site ou citadas no texto. */
  social(network: SocialNetwork, value: string | null): string | null {
    const found = this.scrape.found.socials.filter((s) => s.network === network);
    if (!value) return found[0]?.url ?? null;
    const key = socialKey(value);
    const match = found.find((s) => socialKey(s.url) === key);
    if (match) return match.url;
    const handle = key.split('/').filter(Boolean).pop();
    if (handle && handle.length > 2 && this.text.includes(handle)) {
      return /^https?:\/\//i.test(value) ? value : null;
    }
    return found[0]?.url ?? this.drop(network, value);
  }

  /** Depoimentos precisam ser trechos literais do site. */
  testimonial(text: string): boolean {
    const n = normalize(text);
    const probe = n.slice(0, 60);
    if (probe.length >= 15 && this.text.includes(probe)) return true;
    this.removed.push(`Depoimento descartado (não é um trecho literal do site): "${text.slice(0, 60)}..."`);
    return false;
  }
}

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

export function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[“”"'`´]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function socialKey(url: string) {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^(www|m|mobile|pt-br|br)\./, '')
    .replace(/[?#].*$/, '')
    .replace(/^@/, '')
    .replace(/\/$/, '');
}
