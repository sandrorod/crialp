import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { captureError } from '../lib/observability.js';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, code: err.code, ...(err.details ? { details: err.details } : {}) });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.issues[0]?.message ?? 'Dados inválidos.', code: 'VALIDATION' });
  }
  if ((err as any)?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido.', code: 'BAD_JSON' });
  }
  if ((err as any)?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Conteúdo muito grande para enviar de uma vez.', code: 'BODY_TOO_LARGE' });
  }
  if ((err as any)?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Arquivo muito grande (máximo 2 MB).', code: 'FILE_TOO_LARGE' });
  }
  if ((err as any)?.code === '23505') {
    return res.status(409).json({ error: 'Já existe um registro com esse valor.', code: 'CONFLICT' });
  }
  console.error('[erro]', err);
  captureError(err, { method: req.method, path: req.path });
  res.status(500).json({ error: 'Erro interno. Tente novamente.', code: 'INTERNAL' });
}
