import { one } from '../db/pool.js';

const RESERVED = new Set(['admin', 'api', 'lp', 'uploads', 'assets', 'login', 'preview']);

export function slugify(input: string): string {
  const slug = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'empresa';
}

/** Gera um slug único: clinica-sorriso, clinica-sorriso-2, clinica-sorriso-3... */
export async function uniqueSlug(base: string, ignoreLandingPageId?: string): Promise<string> {
  let root = slugify(base);
  if (RESERVED.has(root)) root = `${root}-empresa`;
  for (let i = 1; i < 1000; i++) {
    const candidate = i === 1 ? root : `${root}-${i}`;
    const taken = await one(
      `select 1 from landing_pages where slug = $1 and ($2::uuid is null or id <> $2::uuid)`,
      [candidate, ignoreLandingPageId ?? null],
    );
    if (!taken) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export function isValidSlug(slug: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 80 && !RESERVED.has(slug);
}
