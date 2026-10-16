import { env } from '../../config/env.js';
import { one, query } from '../../db/pool.js';
import { decrypt, encrypt } from '../ai/keyStore.js';

// drive (completo): necessário para gravar numa pasta criada pelo usuário (drive.file só enxerga o que o app criou)
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const FOLDER_NAME = 'lp';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

const KEYS = { token: 'google_drive_refresh_token', email: 'google_drive_email', folder: 'google_drive_folder_id' } as const;
/** Pasta escolhida pelo usuário (fica mesmo ao desconectar/trocar de conta) */
const TARGET_KEY = 'google_drive_target_folder';

/** Id da pasta a partir do link do Drive (…/folders/<id>) ou do próprio id. */
export function parseFolderId(input: string | null | undefined): string | null {
  const v = input?.trim();
  if (!v) return null;
  const m = v.match(/\/folders\/([\w-]{10,})/) ?? v.match(/[?&]id=([\w-]{10,})/);
  if (m) return m[1];
  return /^[\w-]{10,}$/.test(v) ? v : null;
}

async function targetFolder() {
  return (await getSetting(TARGET_KEY)) ?? parseFolderId(env.googleOAuth.folder);
}

export async function setTargetFolder(input: string | null) {
  if (!input?.trim()) {
    await query('delete from lp_settings where key = $1', [TARGET_KEY]);
    return;
  }
  const id = parseFolderId(input);
  if (!id) throw new Error('Link da pasta do Google Drive inválido.');
  await setSetting(TARGET_KEY, id);
}

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
  const folder = await targetFolder();
  return {
    configured: driveConfigured(),
    connected: !!token,
    email: token ? await getSetting(KEYS.email) : null,
    redirect_uri: driveRedirectUri(),
    target_folder: folder,
    target_folder_url: folder ? `https://drive.google.com/drive/folders/${folder}` : null,
  };
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

/** Pasta escolhida em Configurações; sem ela, a pasta "lp" criada pelo sistema na raiz do Drive. */
async function ensureFolder(accessToken: string) {
  const target = await targetFolder();
  if (target) {
    const f = await driveFetch<{ trashed?: boolean; mimeType?: string }>(accessToken, `https://www.googleapis.com/drive/v3/files/${target}?fields=trashed,mimeType&supportsAllDrives=true`).catch((err) => {
      throw new Error(`Sem acesso à pasta escolhida do Google Drive: confira o link e conecte de novo em Configurações (a conta precisa poder editar a pasta). Detalhe: ${String(err.message).slice(0, 120)}`);
    });
    if (f.trashed || f.mimeType !== FOLDER_MIME) throw new Error('A pasta escolhida do Google Drive está na lixeira ou não é uma pasta: escolha outra em Configurações.');
    return target;
  }
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
 * Envia o JPG para a pasta "lp". Com `existingId` ou com um arquivo de mesmo nome na pasta, substitui o conteúdo
 * (a imagem gerada de novo não duplica). Devolve o id do arquivo, ou null sem Drive conectado.
 */
export async function uploadJpgToDrive(name: string, image: Buffer, existingId: string | null): Promise<string | null> {
  // Sem configuração ou sem conta conectada: avisa o motivo (antes não enviava e não dizia nada)
  if (!driveConfigured()) throw new Error('Google Drive não configurado no servidor: faltam GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET na Vercel.');
  const stored = await getSetting(KEYS.token);
  if (!stored) throw new Error('Google Drive não conectado: conecte em Configurações → Google Drive.');
  const refreshToken = decrypt(stored);
  if (!refreshToken) throw new Error('Conexão com o Google Drive inválida: conecte de novo em Configurações.');
  const { access_token } = await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' }).catch((err) => {
    throw new Error(String(err.message).includes('invalid_grant') ? 'Acesso ao Google Drive expirou ou foi revogado: conecte de novo em Configurações.' : err.message);
  });

  const folderId = await ensureFolder(access_token!);
  // Substitui o conteúdo de um arquivo que está na pasta de destino (não duplica)
  const replace = (id: string) =>
    driveFetch<{ id: string }>(access_token!, `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media&fields=id&supportsAllDrives=true`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'image/jpeg' },
      body: new Uint8Array(image),
    }).catch(() => null);
  // Arquivo já enviado e ainda na pasta de destino: substitui o conteúdo (e acerta o nome).
  if (existingId) {
    const current = await driveFetch<{ parents?: string[]; trashed?: boolean }>(access_token!, `https://www.googleapis.com/drive/v3/files/${existingId}?fields=parents,trashed&supportsAllDrives=true`).catch(() => null);
    const updated = current && !current.trashed && current.parents?.includes(folderId) ? await replace(existingId) : null;
    if (updated) {
      await driveFetch(access_token!, `https://www.googleapis.com/drive/v3/files/${existingId}?fields=id&supportsAllDrives=true`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).catch(() => {});
      return updated.id;
    }
  }
  // Já existe na pasta um arquivo com o mesmo nome (ex.: enviado antes ou por outra LP da empresa): sobrescreve
  const q = `name = '${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`;
  const same = await driveFetch<{ files: { id: string }[] }>(
    access_token!,
    `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q, fields: 'files(id)', pageSize: '1', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' })}`,
  ).catch(() => null);
  if (same?.files[0]) {
    const updated = await replace(same.files[0].id);
    if (updated) return updated.id;
  }

  // Apagado, na lixeira, em outra pasta ou sem arquivo com o mesmo nome: cria na pasta atual.
  const boundary = `lp${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folderId] })}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`),
    image,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const created = await driveFetch<{ id: string }>(access_token!, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: new Uint8Array(body),
  });
  return created.id;
}
