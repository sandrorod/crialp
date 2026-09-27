import { Router } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { authUser } from '../middleware/auth.js';
import { dashboardStats } from '../repositories/landingPages.js';
import { aiService } from '../services/ai/index.js';
import { detectImageType, storage } from '../services/storage/StorageService.js';

export const miscRouter = Router();

miscRouter.get('/dashboard', async (req, res) => {
  const user = authUser(req);
  res.json(await dashboardStats(user.organizationId));
});

miscRouter.get('/settings', (req, res) => {
  const user = authUser(req);
  res.json({
    user: { name: user.name, email: user.email, role: user.role },
    ai: { provider: aiService.providerName, model: aiService.model, configured: aiService.isConfigured() },
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
  const ext = detectImageType(req.file.buffer);
  if (!ext) throw new AppError(400, 'Formato não suportado. Envie JPG, PNG, WEBP ou GIF.');
  const url = await storage.save(req.file.buffer, ext);
  res.status(201).json({ url });
});
