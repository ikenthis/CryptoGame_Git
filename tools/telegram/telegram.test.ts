import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { Announcer, TelegramBot } from '../../apps/server/src/telegram.ts';
import type { Tournament } from '../../apps/server/src/store.ts';
import { LAUNCH_TEXT, announce, parseArgs } from './announce.ts';
import { checkConfig, runSetup, setupSteps } from './setup.ts';

// API de Telegram falsa que registra cada llamada.
const calls: Array<{ method: string; body: any }> = [];
const api: Server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const method = String(req.url).split('/').pop()!;
  calls.push({ method, body: JSON.parse(Buffer.concat(chunks).toString() || '{}') });
  const result = method === 'getMe' ? { username: 'gentium_bot', first_name: 'Bellum Gentium' }
    : method === 'getWebhookInfo' ? { url: 'https://juego.example/api/telegram/webhook', pending_update_count: 0 }
    : method === 'sendMessage' || method === 'sendPhoto' ? { message_id: 77 } : true;
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(method === 'fail' ? { ok: false, description: 'Bad Request' } : { ok: true, result }));
});
let bot: TelegramBot;

before(async () => {
  await new Promise<void>((r) => api.listen(0, r));
  bot = new TelegramBot('123:abc', `http://127.0.0.1:${(api.address() as AddressInfo).port}`);
});
after(() => api.close());

const arena: Tournament = {
  id: 'arena-2026-01-01', name: 'Arena diaria 2026-01-01', closesAt: '2026-01-02T00:00:00.000Z',
  entryFee: 0, sponsorPool: 25_000_000, feeBps: 0, cardPool: 'open', entries: [],
} as unknown as Tournament;

describe('configuración del bot', () => {
  it('detecta variables que faltan o son inseguras', () => {
    assert.equal(checkConfig({}).length, 3);
    assert.match(checkConfig({ TELEGRAM_BOT_TOKEN: 'x', PUBLIC_URL: 'http://a.com', TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(32) })[0], /https/);
    assert.match(checkConfig({ TELEGRAM_BOT_TOKEN: 'x', PUBLIC_URL: 'https://a.com', TELEGRAM_WEBHOOK_SECRET: 'corto' })[0], /16-256/);
    assert.deepEqual(checkConfig({ TELEGRAM_BOT_TOKEN: 'x', PUBLIC_URL: 'https://a.com', TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(32) }), []);
  });

  it('registra comandos, menú y webhook con el secreto', async () => {
    calls.length = 0;
    const lines: string[] = [];
    await runSetup(bot, { publicUrl: 'https://juego.example/', webhookSecret: 's'.repeat(32) }, (l) => lines.push(l));
    assert.deepEqual(calls.map((c) => c.method), ['getMe', ...setupSteps({ publicUrl: 'x', webhookSecret: 'y' }).map((s) => s.method), 'getWebhookInfo']);
    const hook = calls.find((c) => c.method === 'setWebhook')!.body;
    assert.equal(hook.url, 'https://juego.example/api/telegram/webhook');
    assert.equal(hook.secret_token, 's'.repeat(32));
    assert.equal(calls.find((c) => c.method === 'setChatMenuButton')!.body.menu_button.web_app.url, 'https://juego.example/');
    assert.ok(lines.some((l) => l.includes('@gentium_bot')));
  });

  it('propaga los errores de la API', async () => {
    await assert.rejects(bot.call('fail'), /Bad Request/);
  });
});

describe('anuncios', () => {
  const cfg = { bot, publicUrl: 'https://juego.example', appLink: 'https://t.me/gentium_bot/juego', channel: '@bellumgentium' };

  it('interpreta los argumentos', () => {
    assert.deepEqual(parseArgs(['--launch', '--pin']), { mode: 'launch', text: undefined, photo: undefined, pin: true, dryRun: false });
    assert.equal(parseArgs(['--text', 'hola', '--dry-run']).text, 'hola');
    assert.throws(() => parseArgs([]), /--launch/);
  });

  it('publica el lanzamiento con enlace a la Mini App y lo fija', async () => {
    calls.length = 0;
    await announce({ ...cfg, bot }, LAUNCH_TEXT, { pin: true });
    assert.equal(calls[0].method, 'sendMessage');
    assert.equal(calls[0].body.chat_id, '@bellumgentium');
    // En canales no se permiten botones web_app: se usa el enlace directo.
    assert.equal(calls[0].body.reply_markup.inline_keyboard[0][0].url, 'https://t.me/gentium_bot/juego');
    assert.deepEqual(calls[1], { method: 'pinChatMessage', body: { chat_id: '@bellumgentium', message_id: 77, disable_notification: false } });
  });

  it('el servidor anuncia la arena y omite los resultados vacíos', async () => {
    calls.length = 0;
    const announcer = new Announcer({ ...cfg, bot });
    await announcer.arenaOpened(arena);
    assert.match(calls[0].body.text, /Arena diaria 2026-01-01/);
    assert.match(calls[0].body.text, /25 USDC/);
    await announcer.tournamentClosed(arena, (id) => id);
    assert.equal(calls.length, 1);
  });

  it('sin canal configurado no publica nada', async () => {
    calls.length = 0;
    await new Announcer({ bot, publicUrl: 'https://juego.example' }).arenaOpened(arena);
    await new Announcer(null).arenaOpened(arena);
    assert.equal(calls.length, 0);
  });
});
