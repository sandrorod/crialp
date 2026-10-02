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
const envKeyOf = (provider: KeyProvider) => (provider === 'gemini' ? env.ai.geminiApiKey : env.rapidApiKey);

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
    provider_active: provider !== 'gemini' || aiService.providerName === 'gemini',
  });
});

miscRouter.post('/settings/keys/:provider', requireRole(...MANAGER_ROLES), async (req, res) => {
  const user = authUser(req);
  const provider = ProviderParam.parse(req.params.provider);
  const body = parseBody(KeySchema, req.body);
  // Mensagem diz onde a chave já está (a chave do servidor aparece na lista como "Chave do servidor")
  const names: Record<string, string> = { gemini: 'Chaves do Gemini', rapidapi: 'Chaves do RapidAPI' };
  const registered = await aiKeyStore.findByKey(body.key);
  if (registered) {
    const which = `"${registered.label || 'Chave'} (•••• ${registered.last4})"`;
    throw new AppError(
      409,
      registered.provider === provider ? `Esta chave já está na lista como ${which}.` : `Esta chave já está cadastrada em "${names[registered.provider] ?? registered.provider}" como ${which}.`,
      'CONFLICT',
    );
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
  } else {
    await testRapidApiKey(body.key);
  }
  const created = await aiKeyStore.add({ key: body.key, label: body.label, userId: user.id }, provider);
  if (sameAsEnv) await aiKeyStore.removeEnvKey(envKeyOf(provider)!, provider);
  res.status(201).json(created);
});

miscRouter.patch('/settings/keys/:provider/:id', requireRole(...MANAGER_ROLES), async (req, res) => {
  ProviderParam.parse(req.params.provider);
  const body = parseBody(z.object({ active: z.boolean().optional(), label: z.string().trim().max(60).nullish() }), req.body);
  if (!(await aiKeyStore.update(uuidParam.parse(req.params.id), body))) throw notFound('Chave não encontrada.');
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
