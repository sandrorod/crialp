import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { one } from '../../db/pool.js';

export interface StorageService {
  /** Salva o arquivo e devolve a URL pública. */
  save(buffer: Buffer, ext: string): Promise<string>;
}

/** Disco local (servido em /uploads). Para S3/R2/Supabase Storage, implemente StorageService. */
class LocalStorage implements StorageService {
  async save(buffer: Buffer, ext: string) {
    const now = new Date();
    const dir = path.join(env.storage.uploadDir, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
    await fs.mkdir(dir, { recursive: true });
    const name = `${crypto.randomUUID()}.${ext}`;
    await fs.writeFile(path.join(dir, name), buffer);
    return `/uploads/${path.relative(env.storage.uploadDir, path.join(dir, name)).split(path.sep).join('/')}`;
  }
}

/** Vercel Blob (disco do Vercel é somente leitura). Requer BLOB_READ_WRITE_TOKEN. */
class VercelBlobStorage implements StorageService {
  async save(buffer: Buffer, ext: string) {
    const { put } = await import('@vercel/blob');
    const now = new Date();
    const name = `uploads/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`;
    const blob = await put(name, buffer, { access: 'public', contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
    return blob.url;
  }
}

const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

/**
 * No próprio banco (tabela lp_uploads): no Vercel sem Blob Store o disco é somente leitura.
 * Servido em /uploads/db/<id>.<ext> (ver app.ts), caminho aceito como as demais imagens enviadas.
 */
class DatabaseStorage implements StorageService {
  async save(buffer: Buffer, ext: string) {
    const row = await one<{ id: string }>('insert into lp_uploads (content_type, data, size) values ($1, $2, $3) returning id', [MIME[ext] ?? 'application/octet-stream', buffer, buffer.length]);
    return `/uploads/db/${row!.id}.${ext}`;
  }
}

export const storage: StorageService =
  env.storage.driver === 'vercel-blob' ? new VercelBlobStorage() : env.storage.driver === 'database' ? new DatabaseStorage() : new LocalStorage();

/** Imagem guardada no banco (DatabaseStorage). */
export async function readDbUpload(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return one<{ content_type: string; data: Buffer }>('select content_type, data from lp_uploads where id = $1', [id]);
}

/** Confere a assinatura binária do arquivo (não confia na extensão enviada). */
export function detectImageType(buf: Buffer): 'jpg' | 'png' | 'webp' | 'gif' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buf.subarray(0, 6).toString('ascii').startsWith('GIF8')) return 'gif';
  return null;
}
