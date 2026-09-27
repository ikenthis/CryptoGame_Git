import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { PRESET_ARMIES, type Army } from '@gentium/engine';
import { createApp } from '../src/app.ts';
import { signSession } from '../src/auth.ts';
import { TournamentStore } from '../src/store.ts';
import { TelegramBot } from '../src/telegram.ts';

const SECRET = 'session-secret';
const HOOK = 'hook-secret';
const clock = new Date('2026-01-01T12:00:00Z');

// API de Telegram falsa: registra las llamadas del bot.
const sent: Array<{ method: string; body: any }> = [];
const fakeTelegram: Server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  sent.push({ method: String(req.url).split('/').pop()!, body: JSON.parse(Buffer.concat(chunks).toString() || '{}') });
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true, result: {} }));
});

const store = new TournamentStore();
let server: Server;
let base = '';

const token = (sub: string, name: string) => signSession(sub, name, SECRET, clock);
const ANA = token('tg-1', 'ana');
const BRUNO = token('tg-2', 'bruno');
const GUEST = token('guest-abc123', 'invitado');

async function call(method: string, path: string, body?: unknown, auth?: string, headers: Record<string, string> = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${auth}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers, body: await res.json() as any };
}

// Ejército solo con lo que trae un perfil nuevo: comandante inicial y cartas comunes.
const starterArmy: Army = { ...PRESET_ARMIES.cavalry.army, cards: [{ card: 'war-cry', turn: 2 }] };

before(async () => {
  await new Promise<void>((r) => fakeTelegram.listen(0, r));
  const apiBase = `http://127.0.0.1:${(fakeTelegram.address() as AddressInfo).port}`;
  server = createApp({
    store, adminToken: 'admin', now: () => clock, sessionSecret: SECRET, rateLimit: 1000,
    telegram: { bot: new TelegramBot('123:abc', apiBase), publicUrl: 'https://juego.example', webhookSecret: HOOK },
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.close();
  fakeTelegram.close();
});

describe('perfiles en el servidor', () => {
  it('exige sesión y crea el perfil inicial', async () => {
    assert.equal((await call('GET', '/api/game/profile')).status, 401);
    const { status, body } = await call('GET', '/api/game/profile', undefined, ANA);
    assert.equal(status, 200);
    assert.equal(body.profile.resources.gold, 100);
    assert.equal(body.profile.commanders.aldric, 1);
  });

  it('crea sesiones de invitado', async () => {
    const { status, body } = await call('POST', '/api/auth/guest', { name: 'Hilda<script>' });
    assert.equal(status, 200);
    assert.match(body.playerId, /^guest-/);
    assert.equal(body.name, 'Hildascript');
    const me = await call('GET', '/api/game/profile', undefined, body.token);
    assert.equal(me.status, 200);
  });

  it('simula la misión en el servidor y gasta provisiones', async () => {
    const { status, body } = await call('POST', '/api/game/mission', { mission: 'vado', army: starterArmy }, ANA);
    assert.equal(status, 200, JSON.stringify(body));
    assert.ok(body.result.frames.length > 0);
    assert.equal(typeof body.won, 'boolean');
    assert.equal(body.profile.resources.supplies, 9);
  });

  it('rechaza cartas o comandantes que el jugador no posee', async () => {
    const { status, body } = await call('POST', '/api/game/mission', { mission: 'vado', army: PRESET_ARMIES.horde.army }, ANA);
    assert.equal(status, 403);
    assert.match(body.error, /No tienes/);
  });

  it('abre sobres con Fichas Extrañas y no permite gastar lo que no hay', async () => {
    const ok = await call('POST', '/api/game/pack', { kind: 'war' }, GUEST);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.cards.length, 3);
    assert.equal(ok.body.profile.resources.tokens, 5);
    await call('POST', '/api/game/pack', { kind: 'war' }, GUEST);
    const broke = await call('POST', '/api/game/pack', { kind: 'war' }, GUEST);
    assert.equal(broke.status, 400);
    const after = await call('GET', '/api/game/profile', undefined, GUEST);
    assert.equal(after.body.profile.resources.tokens, 0);
  });
});

describe('mercado entre jugadores', () => {
  let listing = '';

  it('solo admite cuentas de Telegram', async () => {
    const res = await call('POST', '/api/market/list', { item: { kind: 'card', id: 'fire-arrow' }, price: 10 }, GUEST);
    assert.equal(res.status, 403);
  });

  it('deja el objeto en custodia al ponerlo a la venta', async () => {
    assert.equal((await call('POST', '/api/market/list', { item: { kind: 'resource', id: 'gold', qty: 5 }, price: 10 }, ANA)).status, 400);
    const res = await call('POST', '/api/market/list', { item: { kind: 'card', id: 'fire-arrow' }, price: 40 }, ANA);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.profile.cards['fire-arrow'] ?? 0, 0);
    listing = res.body.listing.id;
    const again = await call('POST', '/api/market/list', { item: { kind: 'card', id: 'fire-arrow' }, price: 40 }, ANA);
    assert.equal(again.status, 400);
    const list = await call('GET', '/api/market');
    assert.equal(list.body.listings[0].sellerName, 'ana');
  });

  it('transfiere objeto y oro con comisión', async () => {
    assert.equal((await call('POST', '/api/market/buy', { id: listing }, ANA)).status, 409);
    const goldBefore = (await call('GET', '/api/game/profile', undefined, ANA)).body.profile.resources.gold;
    const buy = await call('POST', '/api/market/buy', { id: listing }, BRUNO);
    assert.equal(buy.status, 200);
    assert.equal(buy.body.profile.resources.gold, 60);
    assert.equal(buy.body.profile.cards['fire-arrow'], 2);
    const seller = await call('GET', '/api/game/profile', undefined, ANA);
    assert.equal(seller.body.profile.resources.gold, goldBefore + 40 - 2);
    assert.equal((await call('POST', '/api/market/buy', { id: listing }, BRUNO)).status, 404);
  });

  it('devuelve el objeto al cancelar', async () => {
    const res = await call('POST', '/api/market/list', { item: { kind: 'commander', id: 'lyra' }, price: 99 }, BRUNO);
    assert.equal(res.status, 200);
    assert.equal((await call('POST', '/api/market/cancel', { id: res.body.listing.id }, ANA)).status, 403);
    const back = await call('POST', '/api/market/cancel', { id: res.body.listing.id }, BRUNO);
    assert.equal(back.body.profile.commanders.lyra, 1);
  });
});

describe('bot de Telegram', () => {
  it('rechaza webhooks sin el secreto', async () => {
    assert.equal((await call('POST', '/api/telegram/webhook', {})).status, 401);
    assert.equal((await call('POST', '/api/telegram/webhook', {}, undefined, { 'x-telegram-bot-api-secret-token': 'nope' })).status, 401);
  });

  it('responde a /start con el botón de la Mini App', async () => {
    sent.length = 0;
    const update = { message: { chat: { id: 7, type: 'private' }, from: { first_name: 'Ana' }, text: '/start' } };
    const res = await call('POST', '/api/telegram/webhook', update, undefined, { 'x-telegram-bot-api-secret-token': HOOK });
    assert.equal(res.status, 200);
    assert.equal(sent[0].method, 'sendMessage');
    assert.equal(sent[0].body.chat_id, 7);
    assert.match(sent[0].body.text, /Bienvenido, Ana/);
    assert.equal(sent[0].body.reply_markup.inline_keyboard[0][0].web_app.url, 'https://juego.example');
  });

  it('ignora mensajes de grupos', async () => {
    sent.length = 0;
    const update = { message: { chat: { id: -5, type: 'group' }, text: '/start' } };
    await call('POST', '/api/telegram/webhook', update, undefined, { 'x-telegram-bot-api-secret-token': HOOK });
    assert.equal(sent.length, 0);
  });
});

describe('protecciones', () => {
  it('añade cabeceras de seguridad', async () => {
    const res = await call('GET', '/api/health');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });

  it('limita las peticiones por IP', async () => {
    const limited = createApp({ store: new TournamentStore(), adminToken: 'x', sessionSecret: SECRET, rateLimit: 2 });
    await new Promise<void>((r) => limited.listen(0, r));
    const url = `http://127.0.0.1:${(limited.address() as AddressInfo).port}/api/auth/guest`;
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await fetch(url, { method: 'POST', body: '{}' })).status);
    limited.close();
    assert.deepEqual(codes, [200, 200, 429]);
  });
});
