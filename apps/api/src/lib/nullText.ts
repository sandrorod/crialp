import type { z } from 'zod';

/** Textos que a IA às vezes escreve no lugar de "sem informação" (o Gemini devolve "null" como texto). */
const NULL_TEXT = /^(null|undefined|none|nil|n\/?a|-+|—|não informado|nao informado|não encontrado|nao encontrado|sem informação|sem informacao)$/i;

export function isNullText(v: unknown): v is string {
  return typeof v === 'string' && NULL_TEXT.test(v.trim());
}

/**
 * Troca textos "null" por `blank` em qualquer profundidade e remove esses itens de listas,
 * para que nunca apareçam na página nem nos formulários.
 */
export function dropNullText<T>(value: T, blank: null | '' = null): T {
  if (isNullText(value)) return blank as T;
  if (Array.isArray(value)) return value.filter((v) => !isNullText(v)).map((v) => dropNullText(v, blank)) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, dropNullText(v, blank)])) as T;
  }
  return value;
}

/** Valida a resposta da IA já sem os textos "null": vira null onde o campo aceita, senão texto vazio. */
export function parseWithoutNullText<T extends z.ZodType>(schema: T, raw: unknown) {
  for (const blank of [null, ''] as const) {
    const r = schema.safeParse(dropNullText(raw, blank));
    if (r.success) return r;
  }
  return schema.safeParse(raw);
}
