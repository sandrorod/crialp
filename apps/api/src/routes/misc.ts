import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../config/env.js';
import { AppError, notFound } from '../lib/errors.js';
import { parseBody, uuidParam } from '../lib/validation.js';
import { authUser, MANAGER_ROLES, requireRole } from '../middleware/auth.js';
import { dashboardStats } from '../repositories/landingPages.js';
import { AIProviderError, aiService } from '../services/ai/index.js';
import { aiKeyStore } from '../services/ai/keyStore.js';
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

// ─── Chaves do Gemini (rodízio) ─────────────────────────────────────
const KeySchema = z.object({
  key: z.string().trim().min(20, 'Chave inválida.').max(300, 'Chave inválida.'),
  label: z.string().trim().max(60).nullish(),
});

miscRouter.get('/settings/ai-keys', requireRole(...MANAGER_ROLES), async (_req, res) => {
  res.json({
    keys: await aiKeyStore.list('gemini'),
    // A chave da variável de ambiente também entra no rodízio (não é editável pelo painel)
    env_key: (await aiKeyStore.activeEnvKey(env.ai.geminiApiKey)) ? { last4: env.ai.geminiApiKey!.slice(-4) } : null,
    provider_active: aiService.providerName === 'gemini',
  });
});

miscRouter.post('/settings/ai-keys', requireRole(...MANAGER_ROLES), async (req, res) => {
  const user = authUser(req);
  const body = parseBody(KeySchema, req.body);
  if ((await aiKeyStore.exists(body.key)) || body.key === (await aiKeyStore.activeEnvKey(env.ai.geminiApiKey))) throw new AppError(409, 'Esta chave já está cadastrada.', 'CONFLICT');
  // Só salva chaves que funcionam
  try {
    await aiService.testGeminiKey(body.key);
  } catch (err) {
    const msg = err instanceof AIProviderError ? err.userMessage ?? err.message : 'Não foi possível validar a chave.';
    throw new AppError(400, `Chave recusada pelo Gemini: ${msg}`);
  }
  res.status(201).json(await aiKeyStore.add({ key: body.key, label: body.label, userId: user.id }));
});

miscRouter.patch('/settings/ai-keys/:id', requireRole(...MANAGER_ROLES), async (req, res) => {
  const body = parseBody(z.object({ active: z.boolean().optional(), label: z.string().trim().max(60).nullish() }), req.body);
  if (!(await aiKeyStore.update(uuidParam.parse(req.params.id), body))) throw notFound('Chave não encontrada.');
  res.json({ ok: true });
});

// Chave da variável de ambiente: sai do rodízio (a variável continua no servidor, mas é ignorada)
miscRouter.delete('/settings/ai-keys/env', requireRole(...MANAGER_ROLES), async (_req, res) => {
  if (!env.ai.geminiApiKey) throw notFound('Não há chave do servidor.');
  await aiKeyStore.removeEnvKey(env.ai.geminiApiKey);
  res.json({ ok: true });
});

miscRouter.delete('/settings/ai-keys/:id', requireRole(...MANAGER_ROLES), async (req, res) => {
  if (!(await aiKeyStore.remove(uuidParam.parse(req.params.id)))) throw notFound('Chave não encontrada.');
  res.json({ ok: true });
});
