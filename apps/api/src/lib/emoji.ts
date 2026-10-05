/**
 * Emojis (pictogramas, bandeiras, tons de pele, teclas "1️⃣") — exceto ©, ® e ™, que são texto comum.
 * Os modificadores invisíveis (ZWJ, seletor de variação) saem junto para não sobrar lixo.
 */
const EMOJI = /(?![©®™])\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}‍️⃣]/gu;

export function stripEmojis(text: string): string {
  const out = text.replace(EMOJI, '');
  if (out === text) return text;
  // Espaço que ficava antes/depois do emoji: sem espaço duplo nem nas pontas das linhas
  return out.replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+|[ \t]+$/gm, '');
}

/** Tira emojis de todos os textos de um objeto (arrays e objetos simples; datas e afins ficam como estão). */
export function stripEmojisDeep<T>(value: T): T {
  if (typeof value === 'string') return stripEmojis(value) as T;
  if (Array.isArray(value)) return value.map(stripEmojisDeep) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripEmojisDeep(v)])) as T;
  }
  return value;
}

/** Texto sem nenhuma letra ou número (só emoji, símbolo ou pontuação): não é conteúdo. */
export const isSymbolOnly = (text: string) => !!text.trim() && !/[\p{L}\p{N}]/u.test(text);

/**
 * Esvazia os textos que são só emoji/símbolo (ex.: benefício "✨"), para a página não mostrar um ícone
 * sem texto. Itens de lista continuam no lugar (as posições ligam a prévia aos campos); a página pula os vazios.
 */
export function blankSymbolOnlyDeep<T>(value: T): T {
  // Só espaços também conta como vazio (ex.: subdescrição " " mostraria o ✓ sem texto)
  if (typeof value === 'string') return (!value.trim() || isSymbolOnly(value) ? '' : value) as T;
  if (Array.isArray(value)) return value.map(blankSymbolOnlyDeep) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, blankSymbolOnlyDeep(v)])) as T;
  }
  return value;
}
