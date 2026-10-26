import { after, before, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { env } from '../src/config/env.js';
import { query } from '../src/db/pool.js';
import { client, closeDb, resetDb, seed, startServer } from './helpers.js';

/** Galeria de GIFs do WhatsApp do CRM, com o GIPHY e a Evolution simulados. */
let close: () => Promise<unknown>;
let base: string;
let dono: ReturnType<typeof client>;
const realFetch = globalThis.fetch;
let sentMedia: Record<string, unknown>[] = [];
let mediaUrl = 'https://media2.giphy.com/media/abc123/200w_d.gif?cid=x';
let mediaSize = 50_000;
let GIF_BYTES = Buffer.from('GIF89a-fake-gif-bytes');

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const gif = (id: string) => ({
  id,
  title: `GIF ${id}`,
  images: {
    fixed_width_small: { url: `https://media1.giphy.com/media/${id}/100w.gif`, width: '100', height: '80' },
    fixed_width_downsampled: { url: mediaUrl, size: String(mediaSize) },
    original: { url: 'https://media2.giphy.com/media/x/giphy.gif', mp4: 'https://media2.giphy.com/media/x/giphy.mp4', mp4_size: '40000' },
  },
});

before(async () => {
  await resetDb();
  await seed();
  ({ base, close } = await startServer());
  dono = client(base);
  assert.equal((await dono.login('dono-a@teste.dev')).status, 200);
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === 'api.giphy.com') {
      if (url.pathname.endsWith('/search') || url.pathname.endsWith('/trending'))
        return json(200, { data: [gif('abc123'), gif('def456')], pagination: { offset: 0, count: 2, total_count: 40 } });
      return json(200, { data: gif(url.pathname.split('/').pop()!) });
    }
    if (url.hostname.endsWith('giphy.com')) return new Response(GIF_BYTES, { status: 200 });
    if (url.hostname === 'evo.test' || (url.hostname === 'localhost' && url.port === '7777')) {
      if (url.pathname.startsWith('/message/sendSticker/') || url.pathname.startsWith('/message/sendMedia/')) {
        sentMedia.push({ ...JSON.parse(String(init?.body)), _path: url.pathname.split('/')[2] });
        return json(201, { key: { id: `WA${Date.now()}${Math.random().toString(36).slice(2, 8)}`, remoteJid: '5511999990000@s.whatsapp.net', fromMe: true } });
      }
      return json(200, {});
    }
    return realFetch(input, init);
  });
  await dono.call('PUT', '/api/crm/whatsapp', { api_url: 'http://evo.test', api_key: 'chave', instance: 'lp_teste' });
});
after(async () => {
  mock.restoreAll();
  env.giphyApiKey = undefined;
  await close();
  await closeDb();
});

describe('GIFs no WhatsApp do CRM', () => {
  it('sem chave do GIPHY: avisa que a galeria não está configurada', async () => {
    env.giphyApiKey = undefined;
    const res = await dono.call('GET', '/api/crm/gifs');
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /chave do GIPHY em Configurações/);
  });

  it('lista os GIFs (em alta e busca) com miniatura e próxima página', async () => {
    env.giphyApiKey = 'chave-giphy';
    const r = await (await dono.call('GET', '/api/crm/gifs?q=obrigado')).json();
    assert.equal(r.items.length, 2);
    assert.deepEqual(r.items[0], { id: 'abc123', title: 'GIF abc123', preview: 'https://media1.giphy.com/media/abc123/100w.gif', width: 100, height: 80 });
    assert.equal(r.next_offset, 2);
  });

  it('envia o GIF como figurinha animada (link .gif do GIPHY, que a Evolution converte) e guarda o GIF no CRM', async () => {
    sentMedia = [];
    const res = await dono.call('POST', '/api/crm/messages/gif', { phone: '11999990000', gif_id: 'abc123' });
    assert.equal(res.status, 201);
    assert.equal(sentMedia.length, 1);
    assert.equal(sentMedia[0].sticker, 'https://media2.giphy.com/media/abc123/200w_d.gif?cid=x');
    assert.equal(sentMedia[0].number, '5511999990000');
    const row = (
      await query<{ type: string; mime: string }>(
        `select m.type, md.mime from lp_crm_messages m join lp_crm_media md on md.message_id = m.id order by m.created_at desc limit 1`,
      )
    ).rows[0];
    assert.deepEqual(row, { type: 'sticker', mime: 'image/gif' });
  });

  it('não baixa de fora do GIPHY nem GIF grande demais', async () => {
    mediaUrl = 'https://evil.example.com/x.gif';
    assert.equal((await dono.call('POST', '/api/crm/messages/gif', { phone: '11999990000', gif_id: 'abc123' })).status, 400);
    mediaUrl = 'https://media2.giphy.com/media/abc123/200w_d.gif?cid=x';
    mediaSize = 9_000_000;
    assert.equal((await dono.call('POST', '/api/crm/messages/gif', { phone: '11999990000', gif_id: 'abc123' })).status, 400);
    mediaSize = 50_000;
  });

  it('recusa id de GIF inválido', async () => {
    assert.equal((await dono.call('POST', '/api/crm/messages/gif', { phone: '11999990000', gif_id: '../../x' })).status, 400);
  });
});

describe('Figurinha igual ao GIF original (Evolution que alcança o sistema)', () => {
  it('converte em WebP animado 512×512 sem corte e manda um link temporário ".gif" do sistema', async () => {
    // GIF animado de verdade (3 quadros, 200×100: não quadrado)
    const frames = await Promise.all(
      ['#ff0000', '#00ff00', '#0000ff'].map((c) =>
        sharp({ create: { width: 200, height: 100, channels: 4, background: c } })
          .png()
          .toBuffer(),
      ),
    );
    GIF_BYTES = await sharp(frames, { join: { animated: true } })
      .gif({ delay: [100, 100, 100], loop: 0 })
      .toBuffer();
    // Evolution "local": o sistema (localhost) é alcançável, então a conversão vale
    await dono.call('PUT', '/api/crm/whatsapp', { api_url: 'http://localhost:7777', api_key: 'chave', instance: 'lp_teste' });
    sentMedia = [];
    const res = await dono.call('POST', '/api/crm/messages/gif', { phone: '11999990000', gif_id: 'abc123' });
    assert.equal(res.status, 201);
    const link = String(sentMedia[0].sticker);
    assert.match(link, new RegExp(`^${env.appUrl}/api/crm-webhook/sticker/[0-9a-f-]{36}\\.gif$`));
    // A Evolution baixa pelo link (sem login): WebP animado 512×512 com todos os quadros
    const file = await realFetch(link.replace(env.appUrl, base));
    assert.equal(file.headers.get('content-type'), 'image/webp');
    const meta = await sharp(Buffer.from(await file.arrayBuffer()), { animated: true }).metadata();
    assert.deepEqual([meta.width, meta.pageHeight, meta.pages], [512, 512, 3]);
    // Sem corte: as faixas de cima e de baixo (fora do GIF 200×100 ampliado para 512×256) ficam transparentes
    const { data, info } = await sharp(Buffer.from(await (await realFetch(link.replace(env.appUrl, base))).arrayBuffer()), { page: 0 })
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    assert.equal(alphaAt(256, 10), 0);
    assert.equal(alphaAt(256, 256), 255);
    // No CRM a mensagem guarda a própria figurinha (WebP)
    const stored = (
      await query<{ n: number }>(
        `select count(*)::int as n from lp_crm_messages m join lp_crm_media md on md.message_id = m.id where m.type = 'sticker' and md.mime = 'image/webp'`,
      )
    ).rows[0];
    assert.equal(stored.n, 1);
  });

  it('o link expira em 15 minutos e não aceita outro formato', async () => {
    const id = (await query<{ id: string }>(`insert into lp_crm_sticker_files (data, created_at) values ('x', now() - interval '20 minutes') returning id`))
      .rows[0].id;
    assert.equal((await realFetch(`${base}/api/crm-webhook/sticker/${id}.gif`)).status, 404);
    assert.equal((await realFetch(`${base}/api/crm-webhook/sticker/..%2F..%2Fetc.gif`)).status, 404);
  });
});

describe('GIF de verdade (Evolution ajustada) e GIFs salvos por usuário', () => {
  it('com "GIF de verdade" ligado: manda o MP4 do GIPHY como vídeo com gifPlayback', async () => {
    assert.equal((await dono.call('PUT', '/api/crm/whatsapp/gif-playback', { enabled: true })).status, 200);
    sentMedia = [];
    assert.equal((await dono.call('POST', '/api/crm/messages/gif', { phone: '11999990000', gif_id: 'abc123' })).status, 201);
    assert.equal(sentMedia[0]._path, 'sendMedia');
    assert.equal(sentMedia[0].mediatype, 'video');
    assert.equal(sentMedia[0].mimetype, 'video/mp4');
    assert.equal(sentMedia[0].gifPlayback, true);
    const st = await (await dono.call('GET', '/api/crm/whatsapp')).json();
    assert.equal(st.gif_playback, true);
  });

  let savedId: string;
  it('salva o GIF de uma mensagem na lista do próprio usuário (sem repetir)', async () => {
    const msg = (
      await query<{ id: string }>(
        `select m.id from lp_crm_messages m join lp_crm_media md on md.message_id = m.id where m.type = 'gif' order by m.created_at desc limit 1`,
      )
    ).rows[0];
    const r1 = await dono.call('POST', '/api/crm/saved-gifs', { message_id: msg.id });
    assert.equal(r1.status, 201);
    savedId = (await r1.json()).id;
    const r2 = await (await dono.call('POST', '/api/crm/saved-gifs', { message_id: msg.id })).json();
    assert.equal(r2.id, savedId);
    const list = (await (await dono.call('GET', '/api/crm/saved-gifs')).json()) as { id: string; mime: string }[];
    assert.deepEqual(
      list.map((g) => [g.id, g.mime]),
      [[savedId, 'video/mp4']],
    );
    assert.equal((await dono.call('GET', `/api/crm/saved-gifs/${savedId}/file`)).status, 200);
  });

  it('outro usuário não vê, não abre, não envia nem apaga os GIFs salvos de outra pessoa', async () => {
    const admin = client(base);
    await admin.login('admin-a@teste.dev');
    assert.deepEqual(await (await admin.call('GET', '/api/crm/saved-gifs')).json(), []);
    assert.equal((await admin.call('GET', `/api/crm/saved-gifs/${savedId}/file`)).status, 404);
    assert.equal((await admin.call('POST', '/api/crm/messages/saved-gif', { phone: '11999990000', saved_id: savedId })).status, 404);
    assert.equal((await admin.call('DELETE', `/api/crm/saved-gifs/${savedId}`)).status, 404);
  });

  it('envia o GIF salvo (MP4 como GIF de verdade) e apaga', async () => {
    sentMedia = [];
    assert.equal((await dono.call('POST', '/api/crm/messages/saved-gif', { phone: '11999990000', saved_id: savedId })).status, 201);
    assert.equal(sentMedia[0]._path, 'sendMedia');
    assert.equal(sentMedia[0].gifPlayback, true);
    assert.equal((await dono.call('DELETE', `/api/crm/saved-gifs/${savedId}`)).status, 200);
    assert.deepEqual(await (await dono.call('GET', '/api/crm/saved-gifs')).json(), []);
  });

  it('recusa salvar mensagem que não é GIF', async () => {
    const txt = (
      await query<{ id: string }>(
        `insert into lp_crm_messages (conversation_id, direction, type, body) select conversation_id, 'in', 'text', 'oi' from lp_crm_messages limit 1 returning id`,
      )
    ).rows[0];
    assert.equal((await dono.call('POST', '/api/crm/saved-gifs', { message_id: txt.id })).status, 404);
  });
});
