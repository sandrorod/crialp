import { env } from '../../config/env.js';
import { one, query } from '../../db/pool.js';
import { decrypt, encrypt } from '../ai/keyStore.js';

// drive.file: o sistema só enxerga os arquivos e pastas que ele mesmo criou
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = 'lp';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

const KEYS = { token: 'google_drive_refresh_token', email: 'google_drive_email', folder: 'google_drive_folder_id' } as const;

export const driveRedirectUri = () => `${env.appUrl}/api/google-drive/callback`;
export const driveConfigured = () => !!(env.googleOAuth.clientId && env.googleOAuth.clientSecret);

async function getSetting(key: string) {
  return (await one<{ value: string }>('select value from lp_settings where key = $1', [key]))?.value ?? null;
}

async function setSetting(key: string, value: string) {
  await query(
    `insert into lp_settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, value],
  );
}

export async function driveStatus() {
  const token = await getSetting(KEYS.token);
  return { configured: driveConfigured(), connected: !!token, email: token ? await getSetting(KEYS.email) : null, redirect_uri: driveRedirectUri() };
}

export function driveAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: env.googleOAuth.clientId!,
    redirect_uri: driveRedirectUri(),
    response_type: 'code',
    scope: DRIVE_SCOPE,
    // offline + consent: o Google devolve o refresh token (acesso sem novo login)
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.googleOAuth.clientId!, client_secret: env.googleOAuth.clientSecret!, ...body }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string };
  if (!res.ok || !data.access_token) throw new Error(`Google OAuth: ${data.error ?? res.status}`);
  return data;
}

async function driveFetch<T>(accessToken: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...init.headers } });
  if (!res.ok) throw new Error(`Google Drive ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<T>;
}

/** Troca o código do login pelo refresh token e guarda (criptografado). */
export async function connectDrive(code: string) {
  const data = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: driveRedirectUri() });
  if (!data.refresh_token) throw new Error('Google OAuth: refresh token ausente');
  const about = await driveFetch<{ user?: { emailAddress?: string } }>(data.access_token!, 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)');
  await setSetting(KEYS.token, encrypt(data.refresh_token));
  await setSetting(KEYS.email, about.user?.emailAddress ?? '');
  // Outra conta pode não enxergar a pasta da anterior: procura/cria de novo no próximo envio
  await query('delete from lp_settings where key = $1', [KEYS.folder]);
}

export async function disconnectDrive() {
  await query('delete from lp_settings where key = any($1)', [Object.values(KEYS)]);
}

/** Pasta "lp" criada pelo sistema na raiz do Drive (criada no primeiro envio). */
async function ensureFolder(accessToken: string) {
  const saved = await getSetting(KEYS.folder);
  if (saved) {
    const f = await driveFetch<{ trashed?: boolean }>(accessToken, `https://www.googleapis.com/drive/v3/files/${saved}?fields=trashed`).catch(() => null);
    if (f && !f.trashed) return saved;
  }
  const q = `name = '${FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false and 'root' in parents`;
  const found = await driveFetch<{ files: { id: string }[] }>(accessToken, `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q, fields: 'files(id)', pageSize: '1' })}`);
  const id =
    found.files[0]?.id ??
    (
      await driveFetch<{ id: string }>(accessToken, 'https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
      })
    ).id;
  await setSetting(KEYS.folder, id);
  return id;
}

/**
 * Envia o JPG para a pasta "lp". Com `existingId`, substitui o conteúdo do mesmo arquivo
 * (a imagem gerada de novo não duplica). Devolve o id do arquivo, ou null sem Drive conectado.
 */
export async function uploadJpgToDrive(name: string, image: Buffer, existingId: string | null): Promise<string | null> {
  if (!driveConfigured()) return null;
  const stored = await getSetting(KEYS.token);
  if (!stored) return null;
  const refreshToken = decrypt(stored);
  if (!refreshToken) throw new Error('Conexão com o Google Drive inválida: conecte de novo em Configurações.');
  const { access_token } = await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' }).catch((err) => {
    throw new Error(String(err.message).includes('invalid_grant') ? 'Acesso ao Google Drive expirou ou foi revogado: conecte de novo em Configurações.' : err.message);
  });

  if (existingId) {
    const updated = await driveFetch<{ id: string }>(access_token!, `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media&fields=id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'image/jpeg' },
      body: new Uint8Array(image),
    }).catch(() => null); // arquivo apagado no Drive: cria outro
    if (updated) {
      await driveFetch(access_token!, `https://www.googleapis.com/drive/v3/files/${existingId}?fields=id`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).catch(() => {});
      return updated.id;
    }
  }

  const folderId = await ensureFolder(access_token!);
  const boundary = `lp${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folderId] })}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`),
    image,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const created = await driveFetch<{ id: string }>(access_token!, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: new Uint8Array(body),
  });
  return created.id;
}
