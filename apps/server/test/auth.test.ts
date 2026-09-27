import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { PRESET_ARMIES } from '@gentium/engine';
import { createApp } from '../src/app.ts';
import { signSession, verifySession, verifyTelegramInitData } from '../src/auth.ts';
import { TournamentStore } from '../src/store.ts';

const BOT = '123456:TEST-bot-token';
const SECRET = 'session-secret';
const NOW = new Date('2026-01-01T12:00:00Z');
const nowSec = Math.floor(NOW.getTime() / 1000);

/** Construye un initData firmado siguiendo literalmente la documentación de Telegram. */
function initData(user: object, authDate = nowSec, botToken = BOT): string {
  const fields: Record<string, string> = { auth_date: String(authDate), query_id: 'AAHdF6IQAAAAAN0XohDhrOrc', user: JSON.stringify(user) };
  const dataCheck = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secret).update(dataCheck).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const ana = { id: 42, first_name: 'Ana', username: 'ana_gentium' };

describe('verifyTelegramInitData', () => {
  it('acepta datos firmados por el bot', () => {
    assert.deepEqual(verifyTelegramInitData(initData(ana), BOT, NOW), ana);
  });

  it('rechaza datos alterados, de otro bot o caducados', () => {
    const tampered = initData(ana).replace('ana_gentium', 'impostor');
    assert.equal(verifyTelegramInitData(tampered, BOT, NOW), null);
    assert.equal(verifyTelegramInitData(initData(ana, nowSec, 'otro:bot'), BOT, NOW), null);
    assert.equal(verifyTelegramInitData(initData(ana, nowSec - 2 * 86_400), BOT, NOW), null);
    assert.equal(verifyTelegramInitData('user=%7B%7D', BOT, NOW), null);
  });
});

describe('sesiones', () => {
  it('firma y verifica, y rechaza tokens alterados o caducados', () => {
    const token = signSession('tg-42', 'ana', SECRET, NOW, 60);
    assert.equal(verifySession(token, SECRET, NOW)?.sub, 'tg-42');
    assert.equal(verifySession(token, 'otro-secreto', NOW), null);
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'tg-1', name: 'x', exp: nowSec + 60 })).toString('base64url');
    assert.equal(verifySession(`${forged}.${sig}`, SECRET, NOW), null);
    assert.equal(verifySession(`${body}.${sig}`, SECRET, new Date(NOW.getTime() + 61_000)), null);
  });
});

describe('API con Telegram y estáticos', () => {
  let base = '';
  let strictBase = '';
  let dir = '';
  const servers: Array<ReturnType<typeof createApp>> = [];

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'web-'));
    await mkdir(join(dir, 'assets'));
    await writeFile(join(dir, 'index.html'), '<!doctype html><title>Bellum Gentium</title>');
    await writeFile(join(dir, 'assets', 'app.js'), 'console.log(1)');
    const store = new TournamentStore();
    store.create({ id: 'arena', name: 'Arena', closesAt: '2026-01-02T00:00:00Z', entryFee: 0, sponsorPool: 0, feeBps: 0, cardPool: 'open' });
    const common = { store, adminToken: 'admin', now: () => NOW, telegramBotToken: BOT, sessionSecret: SECRET };
    for (const [opts, set] of [[{ ...common, staticDir: dir }, (u: string) => { base = u; }], [{ ...common, requireAuth: true }, (u: string) => { strictBase = u; }]] as const) {
      const server = createApp(opts);
      await new Promise<void>((r) => server.listen(0, r));
      set(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
      servers.push(server);
    }
  });
  after(async () => {
    for (const s of servers) s.close();
    await rm(dir, { recursive: true, force: true });
  });

  const post = (url: string, body: unknown, token?: string) => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

  it('inicia sesión con Telegram y la inscripción usa la identidad verificada', async () => {
    const login = await post(`${base}/api/auth/telegram`, { initData: initData(ana) });
    assert.equal(login.status, 200);
    const { token, playerId, name } = await login.json() as { token: string; playerId: string; name: string };
    assert.equal(playerId, 'tg-42');
    assert.equal(name, 'ana_gentium');

    const me = await fetch(`${base}/api/me`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal((await me.json() as { sub: string }).sub, 'tg-42');

    const entry = await post(`${base}/api/tournaments/arena/entries`, { playerId: 'otro', army: PRESET_ARMIES.horde.army }, token);
    assert.equal(entry.status, 200);
    assert.equal((await entry.json() as { playerId: string }).playerId, 'tg-42');
  });

  it('rechaza initData falso y nombres anónimos con el prefijo reservado', async () => {
    assert.equal((await post(`${base}/api/auth/telegram`, { initData: initData(ana, nowSec, 'otro:bot') })).status, 401);
    const spoof = await post(`${base}/api/tournaments/arena/entries`, { playerId: 'tg-42', army: PRESET_ARMIES.horde.army });
    assert.equal(spoof.status, 400);
  });

  it('con requireAuth exige sesión para inscribirse', async () => {
    const anon = await post(`${strictBase}/api/tournaments/arena/entries`, { playerId: 'beto', army: PRESET_ARMIES.wall.army });
    assert.equal(anon.status, 401);
  });

  it('sirve el cliente compilado con fallback de SPA y sin salir de la carpeta', async () => {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type')!, /text\/html/);
    const asset = await fetch(`${base}/assets/app.js`);
    assert.match(asset.headers.get('cache-control')!, /immutable/);
    assert.match(await (await fetch(`${base}/partida/123`)).text(), /Bellum Gentium/);
    assert.equal((await fetch(`${base}/..%2F..%2Fpackage.json`)).status, 404);
    assert.equal((await fetch(`${base}/api/nada`)).status, 404);
  });
});
