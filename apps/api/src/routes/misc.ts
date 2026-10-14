import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../config/env.js';
import { AppError, notFound } from '../lib/errors.js';
import { parseBody, uuidParam } from '../lib/validation.js';
import { authUser, MANAGER_ROLES, requireRole } from '../middleware/auth.js';
import { dashboardStats } from '../repositories/landingPages.js';
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

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

/** Upload de imagens fornecidas pelo administrador (logotipo, fotos). */
miscRouter.post('/uploads', upload.single('file'), async (req, res) => {
  authUser(req);
  if (!req.file) throw new AppError(400, 'Nenhum arquivo enviado.');
  if (env.isVercel && env.storage.driver === 'local') {
    throw new AppError(503, 'Upload indisponível: no Vercel, conecte um Blob Store ao projeto (Storage → Blob) para habilitar o envio de imagens.');
  }
  const ext = detectImageType(req.file.buffer);
  if (!ext) throw new AppError(400, 'Formato não suportado. Envie JPG, PNG, WEBP ou GIF.');
  const url = await storage.save(req.file.buffer, ext);
  res.status(201).json({ url });
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
