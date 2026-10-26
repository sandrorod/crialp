import { after, before, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../src/config/env.js';
import { query } from '../src/db/pool.js';
import { client, closeDb, resetDb, seed, startServer } from './helpers.js';

/** Galeria de GIFs do WhatsApp do CRM, com o GIPHY e a Evolution simulados. */
let close: () => Promise<unknown>;
let dono: ReturnType<typeof client>;
const realFetch = globalThis.fetch;
let sentMedia: Record<string, unknown>[] = [];
let mediaUrl = 'https://media2.giphy.com/media/abc123/200w_d.gif?cid=x';
let mediaSize = 50_000;
const GIF_BYTES = Buffer.from('GIF89a-fake-gif-bytes');

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const gif = (id: string) => ({
  id,
  title: `GIF ${id}`,
  images: {
    fixed_width_small: { url: `https://media1.giphy.com/media/${id}/100w.gif`, width: '100', height: '80' },
    fixed_width_downsampled: { url: mediaUrl, size: String(mediaSize) },
  },
});

before(async () => {
  await resetDb();
  await seed();
  let base: string;
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
    if (url.hostname === 'evo.test') {
      if (url.pathname.startsWith('/message/sendSticker/')) {
        sentMedia.push(JSON.parse(String(init?.body)));
        return json(201, { key: { id: `WA${sentMedia.length}`, remoteJid: '5511999990000@s.whatsapp.net', fromMe: true } });
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
