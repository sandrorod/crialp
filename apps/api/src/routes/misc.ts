import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { PgRateLimitStore } from '../lib/rateLimitStore.js';
import { z } from 'zod';
import { env } from '../config/env.js';
import { one, query } from '../db/pool.js';
import { AppError, notFound } from '../lib/errors.js';
import { parseBody, uuidParam } from '../lib/validation.js';
import { authUser, MANAGER_ROLES, requireRole } from '../middleware/auth.js';
import { dashboardStats, wpCompanies } from '../repositories/landingPages.js';
import { AIProviderError, aiService } from '../services/ai/index.js';
import { aiKeyStore, KEY_PROVIDERS, type KeyProvider } from '../services/ai/keyStore.js';
import { testRapidApiKey } from '../services/search/companySearch.js';
import { getRapidGeminiConfig, rapidGemini, saveRapidGeminiConfig } from '../services/ai/RapidApiGemini.js';
import { detectImageType, storage } from '../services/storage/StorageService.js';

export const miscRouter = Router();

miscRouter.get('/dashboard', async (req, res) => {
  const user = authUser(req);
  res.json(await dashboardStats(user.organizationId));
});

/** Popups dos cards "WP verificado" e "Sem WP": número e status do teste de cada empresa. */
miscRouter.get('/dashboard/wp-verified', async (req, res) => {
  const user = authUser(req);
  res.json({ items: await wpCompanies(user.organizationId, true) });
});
miscRouter.get('/dashboard/wp-missing', async (req, res) => {
  const user = authUser(req);
  res.json({ items: await wpCompanies(user.organizationId, false) });
});

miscRouter.get('/settings', async (req, res) => {
  const user = authUser(req);
  res.json({
    user: { name: user.name, email: user.email, role: user.role },
    ai: { provider: aiService.providerName, model: aiService.model, configured: await aiService.isConfigured() },
    app_url: env.appUrl,
    storage: env.storage.driver,
    environment: env.isProduction ? 'produção' : 'desenvolvimento',
  });
});

// 2 MB — o painel já compacta antes de enviar (apps/web/src/lib/compressImage.ts)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

// Cada envio fica guardado (no banco, no Blob ou no disco): limita o volume por hora
const uploadLimiter = rateLimit({
  store: new PgRateLimitStore('upload'),
  windowMs: 60 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Limite de envios de imagens por hora atingido. Tente mais tarde.' },
});

/** Upload de imagens fornecidas pelo administrador (logotipo, fotos). */
miscRouter.post('/uploads', uploadLimiter, upload.single('file'), async (req, res) => {
  authUser(req);
  if (!req.file) throw new AppError(400, 'Nenhum arquivo enviado.');
  const ext = detectImageType(req.file.buffer);
  if (!ext) throw new AppError(400, 'Formato não suportado. Envie JPG, PNG, WEBP ou GIF.');
  const url = await storage.save(req.file.buffer, ext);
  res.status(201).json({ url });
});

// ─── Atendimento (tabela atendimento_lp): textos de respostas editados em Configurações ─────
const RespostasSchema = z.object({
  titulo: z.string().trim().max(300, 'Título muito longo (máximo de 300 caracteres).').nullish().transform((v) => v || null),
  respostas: z.string().max(4_000_000, 'Texto muito grande (máximo de 4 milhões de caracteres).').nullable(),
});
const ATENDIMENTO_COLUMNS = 'id::text, titulo, respostas';

miscRouter.get('/settings/atendimento', requireRole(...MANAGER_ROLES), async (_req, res) => {
  const { rows } = await query(`select ${ATENDIMENTO_COLUMNS} from atendimento_lp order by id`);
  res.json({ items: rows });
});

miscRouter.post('/settings/atendimento', requireRole(...MANAGER_ROLES), async (req, res) => {
  const { titulo, respostas } = parseBody(RespostasSchema, req.body);
  const row = await one(`insert into atendimento_lp (titulo, respostas) values ($1, $2) returning ${ATENDIMENTO_COLUMNS}`, [titulo, respostas]);
  res.status(201).json(row);
});

miscRouter.put('/settings/atendimento/:id', requireRole(...MANAGER_ROLES), async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const { titulo, respostas } = parseBody(RespostasSchema, req.body);
  const row = await one(`update atendimento_lp set titulo = $2, respostas = $3 where id = $1 returning ${ATENDIMENTO_COLUMNS}`, [id, titulo, respostas]);
  if (!row) throw notFound('Registro não encontrado.');
  res.json(row);
});

miscRouter.delete('/settings/atendimento/:id', requireRole(...MANAGER_ROLES), async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const { rowCount } = await query('delete from atendimento_lp where id = $1', [id]);
  if (!rowCount) throw notFound('Registro não encontrado.');
  res.json({ ok: true });
});

// ─── Chaves de API com rodízio (Gemini e RapidAPI) ──────────────────
const ProviderParam = z.enum(KEY_PROVIDERS, { message: 'Provedor inválido.' });
const envKeyOf = (provider: KeyProvider) => (provider === 'gemini' ? env.ai.geminiApiKey : provider === 'rapidapi' ? env.rapidApiKey : undefined);
const isRapid = (p: string) => p === 'rapidapi' || p === 'rapidapi_gemini';

const KeySchema = z.object({
  key: z.string().trim().min(20, 'Chave inválida.').max(300, 'Chave inválida.'),
  label: z.string().trim().max(60).nullish(),
});

miscRouter.get('/settings/keys/:provider', requireRole(...MANAGER_ROLES), async (req, res) => {
  const provider = ProviderParam.parse(req.params.provider);
  const envKey = await aiKeyStore.activeEnvKey(envKeyOf(provider), provider);
  res.json({
    keys: await aiKeyStore.list(provider),
    // A chave da variável de ambiente também entra no rodízio (não é editável pelo painel)
    env_key: envKey ? { last4: envKey.slice(-4) } : null,
    // Gemini e RapidAPI — Gemini só valem com AI_PROVIDER=gemini
    provider_active: provider === 'rapidapi' || aiService.providerName === 'gemini',
  });
});

miscRouter.post('/settings/keys/:provider', requireRole(...MANAGER_ROLES), async (req, res) => {
  const user = authUser(req);
  const provider = ProviderParam.parse(req.params.provider);
  const body = parseBody(KeySchema, req.body);
  // Mensagem diz onde a chave já está (a chave do servidor aparece na lista como "Chave do servidor")
  const names: Record<string, string> = { gemini: 'Chaves do Gemini', rapidapi: 'Chaves do RapidAPI — Maps', rapidapi_gemini: 'Chaves do RapidAPI — Gemini' };
  const registered = await aiKeyStore.findByKey(body.key, provider);
  if (registered && registered.provider === provider) {
    const which = `"${registered.label || 'Chave'} (•••• ${registered.last4})"`;
    throw new AppError(409, `Esta chave já está na lista como ${which}.`, 'KEY_EXISTS', { id: registered.id, provider: registered.provider });
  }
  // Mesma chave da variável do servidor: passa a ser gerenciada pelo painel (entra na lista com o nome
  // escolhido e sai do lugar de "Chave do servidor", sem ficar duas vezes no rodízio)
  const sameAsEnv = body.key.trim() === (await aiKeyStore.activeEnvKey(envKeyOf(provider), provider));
  // Só salva chaves que funcionam
  if (provider === 'gemini') {
    try {
      await aiService.testGeminiKey(body.key);
    } catch (err) {
      const msg = err instanceof AIProviderError ? err.userMessage ?? err.message : 'Não foi possível validar a chave.';
      throw new AppError(400, `Chave recusada pelo Gemini: ${msg}`);
    }
  } else if (provider === 'rapidapi_gemini') {
    try {
      await rapidGemini.testKey(body.key);
    } catch (err) {
      const msg = err instanceof AIProviderError ? err.userMessage ?? err.message : 'Não foi possível validar a chave.';
      throw new AppError(400, `Chave recusada: ${msg}`);
    }
  } else {
    await testRapidApiKey(body.key);
  }
  // Chave cadastrada na lista do outro provedor (ex.: chave do Gemini colada em "Chaves do RapidAPI"):
  // já passou no teste deste provedor, então é movida para cá em vez de recusar
  // A mesma chave do RapidAPI pode ficar em Maps e em Gemini (uma chave vale para todas as APIs assinadas)
  if (registered && !(isRapid(registered.provider) && isRapid(provider))) {
    const moved = await aiKeyStore.moveTo(registered.id, provider, body.label);
    res.status(201).json({ ...moved, moved_from: names[registered.provider] ?? registered.provider });
    return;
  }
  const created = await aiKeyStore.add({ key: body.key, label: body.label, userId: user.id }, provider);
  if (sameAsEnv) await aiKeyStore.removeEnvKey(envKeyOf(provider)!, provider);
  res.status(201).json(created);
});

// API de Gemini do RapidAPI usada pelas "Chaves do RapidAPI — Gemini" (cada API tem host e formato próprios)
const RapidGeminiConfigSchema = z.object({
  host: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.p\.rapidapi\.com$/, 'Host inválido: use o X-RapidAPI-Host (algo.p.rapidapi.com).'),
  path: z.string().trim().max(200).regex(/^\/?[\w\-./?=&%:]*$/, 'Caminho inválido.'),
  format: z.enum(['google', 'openai', 'template']),
  model: z.string().trim().max(80),
  template: z
    .string()
    .max(20000)
    .optional()
    .refine((t) => {
      if (!t) return true;
      try {
        JSON.parse(t.split('"{{prompt}}"').join('""'));
        return true;
      } catch {
        return false;
      }
    }, 'Corpo do pedido inválido.'),
}).refine((c) => c.format !== 'template' || !!c.template?.includes('"{{prompt}}"'), { message: 'O corpo do pedido precisa ter "{{prompt}}" onde vai o texto.', path: ['template'] });

miscRouter.get('/settings/rapidapi-gemini', requireRole(...MANAGER_ROLES), async (_req, res) => {
  res.json(await getRapidGeminiConfig());
});

miscRouter.put('/settings/rapidapi-gemini', requireRole(...MANAGER_ROLES), async (req, res) => {
  const body = parseBody(RapidGeminiConfigSchema, req.body);
  const cfg = { ...body, path: body.path.startsWith('/') ? body.path : `/${body.path}` };
  await saveRapidGeminiConfig(cfg);
  res.json(cfg);
});

miscRouter.patch('/settings/keys/:provider/:id', requireRole(...MANAGER_ROLES), async (req, res) => {
  ProviderParam.parse(req.params.provider);
  const body = parseBody(z.object({ active: z.boolean().optional(), label: z.string().trim().max(60).nullish() }), req.body);
  if (!(await aiKeyStore.update(uuidParam.parse(req.params.id), body))) throw notFound('Chave não encontrada.');
  res.json({ ok: true });
});

// Testa de novo uma chave cadastrada (ex.: depois de renovar a assinatura): se responder, o último erro sai da lista
miscRouter.post('/settings/keys/:provider/:id/test', requireRole(...MANAGER_ROLES), async (req, res) => {
  const provider = ProviderParam.parse(req.params.provider);
  const key = await aiKeyStore.get(uuidParam.parse(req.params.id), provider);
  if (!key) throw notFound('Chave não encontrada (ou ilegível: cadastre-a novamente).');
  try {
    if (provider === 'gemini') await aiService.testGeminiKey(key.key);
    else if (provider === 'rapidapi_gemini') await rapidGemini.testKey(key.key);
    else await testRapidApiKey(key.key);
  } catch (err) {
    const msg = err instanceof AIProviderError ? err.userMessage ?? err.message : err instanceof Error ? err.message : 'Não foi possível validar a chave.';
    await aiKeyStore.recordError(key.id, err instanceof Error ? err.message : String(err));
    throw new AppError(400, `A chave ainda não responde: ${msg}`);
  }
  await aiKeyStore.clearError(key.id);
  res.json({ ok: true });
});

/**
 * Diagnóstico da API de Gemini do RapidAPI (temporário): manda pedidos mínimos em vários formatos com a primeira
 * chave cadastrada e devolve a resposta completa de cada um (status, corpo e cabeçalhos de limite do RapidAPI).
 * A chave não aparece na resposta. Abrir no navegador logado: /api/settings/rapid-gemini/diagnose
 */
miscRouter.get('/settings/rapid-gemini/diagnose', requireRole(...MANAGER_ROLES), async (_req, res) => {
  const [key] = await aiKeyStore.rotation('rapidapi_gemini');
  if (!key) throw notFound('Nenhuma chave do RapidAPI (Gemini) cadastrada.');
  const cfg = await getRapidGeminiConfig();
  const msg = [{ role: 'user', content: 'Responda apenas: ok' }];
  const variants: { name: string; method?: string; path?: string; body?: unknown }[] = [
    { name: 'config atual (openai + modelo da config)', body: { model: cfg.model, messages: msg } },
    { name: 'openai sem modelo', body: { messages: msg } },
    { name: 'openai modelo gemini-2.5-flash', body: { model: 'gemini-2.5-flash', messages: msg } },
    { name: 'openai modelo gemini-1.5-flash-latest', body: { model: 'gemini-1.5-flash-latest', messages: msg } },
    { name: 'openai papel system + user', body: { model: cfg.model, messages: [{ role: 'system', content: 'Seja breve.' }, ...msg] } },
    { name: 'google contents', body: { contents: [{ role: 'user', parts: [{ text: 'Responda apenas: ok' }] }] } },
    { name: 'campo prompt', body: { prompt: 'Responda apenas: ok' } },
    { name: 'campo text', body: { text: 'Responda apenas: ok' } },
    { name: 'GET no caminho da config', method: 'GET' },
  ];
  const results = [];
  for (const v of variants) {
    const path = v.path ?? (cfg.path.startsWith('/') ? cfg.path : `/${cfg.path}`);
    const started = Date.now();
    const r = await fetch(`https://${cfg.host}${path}`, {
      method: v.method ?? 'POST',
      headers: { 'x-rapidapi-key': key.key, 'x-rapidapi-host': cfg.host, ...(v.body ? { 'Content-Type': 'application/json' } : {}) },
      body: v.body ? JSON.stringify(v.body) : undefined,
      signal: AbortSignal.timeout(60_000),
    }).catch((err: Error) => err);
    if (r instanceof Error) {
      results.push({ variant: v.name, error: r.message });
      continue;
    }
    const headers = Object.fromEntries([...r.headers.entries()].filter(([h]) => /ratelimit|rapidapi|server|content-type|x-request|date/i.test(h)));
    results.push({ variant: v.name, method: v.method ?? 'POST', path, status: r.status, ms: Date.now() - started, body: (await r.text()).slice(0, 1500), headers });
  }
  res.json({ host: cfg.host, path: cfg.path, format: cfg.format, model: cfg.model, key_last4: key.key.slice(-4), results });
});

// Chave da variável de ambiente: sai do rodízio (a variável continua no servidor, mas é ignorada)
miscRouter.delete('/settings/keys/:provider/env', requireRole(...MANAGER_ROLES), async (req, res) => {
  const provider = ProviderParam.parse(req.params.provider);
  const envKey = envKeyOf(provider);
  if (!envKey) throw notFound('Não há chave do servidor.');
  await aiKeyStore.removeEnvKey(envKey, provider);
  res.json({ ok: true });
});

miscRouter.delete('/settings/keys/:provider/:id', requireRole(...MANAGER_ROLES), async (req, res) => {
  ProviderParam.parse(req.params.provider);
  if (!(await aiKeyStore.remove(uuidParam.parse(req.params.id)))) throw notFound('Chave não encontrada.');
  res.json({ ok: true });
});
