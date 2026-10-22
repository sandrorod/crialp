import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { one, pool, query } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';
import { createCompany } from '../src/repositories/companies.js';
import { createLandingPage } from '../src/repositories/landingPages.js';
import { CompanyInputSchema } from '../src/lib/validation.js';
import { normalizeThemeSettings } from '../src/landing/theme.js';
import type { LandingContent } from '../src/services/ai/schemas.js';

export const ORIGIN = 'http://localhost:5173';
export const PASSWORD = 'senha-de-teste-123';

/** Apaga e recria o banco de teste (recusa qualquer banco que não termine em _test). */
export async function resetDb() {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (!name.endsWith('_test')) throw new Error(`Banco "${name}" não é de teste: abortado.`);
  await query('drop schema public cascade');
  await query('create schema public');
  await runMigrations(() => {});
}

export function content(headline = 'Atendimento de qualidade'): LandingContent {
  return {
    design: { preset: 'food', primary_color: '#1d4ed8', accent_color: '#f59e0b', hero_variant: 'split', rationale: 'teste' },
    seo: { title: 'Empresa Teste', description: 'Descrição da empresa de teste para a página.', keywords: ['teste'] },
    hero: { eyebrow: null, headline, subheadline: 'Subtítulo', primary_cta: 'Fale conosco', secondary_cta: null, highlights: [] },
    about: { title: 'Sobre', paragraphs: ['Parágrafo sobre a empresa.'] },
    services: null,
    differentials: null,
    products: null,
    gallery: null,
    testimonials: null,
    faq: null,
    contact: { title: 'Contato', subtitle: null },
    final_cta: { title: 'Vamos conversar?', subtitle: null, cta: 'Chamar' },
    section_order: ['about', 'contact', 'final_cta'],
  } as unknown as LandingContent;
}

async function user(orgId: string, email: string, role: string) {
  const row = await one<{ id: string }>(
    `insert into users (organization_id, name, email, password_hash, role) values ($1, $2, $3, $4, $5) returning id`,
    [orgId, email.split('@')[0], email, await bcrypt.hash(PASSWORD, 4), role],
  );
  return row!.id;
}

async function page(orgId: string, userId: string, companyName: string, title: string) {
  const companyId = await createCompany(orgId, userId, CompanyInputSchema.parse({ name: companyName, phone: '(11) 3333-4444' }), {});
  const lpId = await createLandingPage({
    orgId,
    companyId,
    userId,
    title,
    content: content(),
    theme: normalizeThemeSettings({ preset: 'food' }),
    seo: { seo_title: null, seo_description: null, seo_keywords: [], og_image: null },
  });
  return { companyId, lpId };
}

/** Duas organizações independentes (A e B) com equipe, cliente, empresas e páginas. */
export async function seed() {
  const orgA = (await one<{ id: string }>(`insert into organizations (name) values ('Org A') returning id`))!.id;
  const orgB = (await one<{ id: string }>(`insert into organizations (name) values ('Org B') returning id`))!.id;
  const ownerA = await user(orgA, 'dono-a@teste.dev', 'owner');
  const adminA = await user(orgA, 'admin-a@teste.dev', 'admin');
  const sellerA = await user(orgA, 'vendedor-a@teste.dev', 'seller');
  const clientA = await user(orgA, 'cliente-a@teste.dev', 'client');
  const ownerB = await user(orgB, 'dono-b@teste.dev', 'owner');
  const a1 = await page(orgA, ownerA, 'Padaria A', 'Padaria A');
  const a2 = await page(orgA, ownerA, 'Oficina A', 'Oficina A');
  const b1 = await page(orgB, ownerB, 'Loja B', 'Loja B');
  await query('insert into lp_client_pages (user_id, landing_page_id) values ($1, $2)', [clientA, a1.lpId]);
  // Páginas nascem inativas: publicadas aqui para os testes de página pública
  await query(`update landing_pages set status = 'ativa'`);
  return { orgA, orgB, ownerA, adminA, sellerA, clientA, ownerB, a1, a2, b1 };
}

export async function startServer() {
  const server: Server = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

export function sessionCookie(res: Response): string | null {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith('lp_session='));
  return raw ? raw.split(';')[0] : null;
}

/** Cliente HTTP com cookie de sessão e cabeçalho Origin do painel. */
export function client(base: string) {
  let cookie: string | null = null;
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: {
        ...(body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { Origin: ORIGIN } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    const fresh = sessionCookie(res);
    if (fresh) cookie = fresh;
    return res;
  };
  return {
    get cookie() {
      return cookie;
    },
    set cookie(v: string | null) {
      cookie = v;
    },
    call,
    login: async (email: string, password = PASSWORD) => call('POST', '/api/auth/login', { email, password }),
  };
}

export async function closeDb() {
  await pool.end();
}
