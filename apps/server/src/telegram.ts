import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Standing } from '@gentium/engine';
import { fail, readJson, type Route } from './http.ts';
import { poolOf, type Tournament, type TournamentStore } from './store.ts';

// Bot de Telegram: responde a los comandos del chat privado y publica anuncios
// automáticos en el canal (arena abierta, resultados de torneos). Usa la Bot API
// por HTTPS con fetch, sin dependencias.

type Button = { text: string; url?: string; web_app?: { url: string } };

export class TelegramBot {
  readonly token: string;
  readonly apiBase: string;

  constructor(token: string, apiBase = 'https://api.telegram.org') {
    this.token = token;
    this.apiBase = apiBase;
  }

  async call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(`${this.apiBase}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
    });
    const body = await res.json().catch(() => ({})) as { ok?: boolean; result?: T; description?: string };
    if (!body.ok) throw new Error(`Telegram ${method}: ${body.description ?? res.status}`);
    return body.result as T;
  }

  sendMessage(chatId: string | number, html: string, buttons: Button[][] = []): Promise<unknown> {
    return this.call('sendMessage', {
      chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true,
      ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
    });
  }

  sendPhoto(chatId: string | number, photo: string, html: string, buttons: Button[][] = []): Promise<unknown> {
    return this.call('sendPhoto', {
      chat_id: chatId, photo, caption: html, parse_mode: 'HTML',
      ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
    });
  }
}

export interface TelegramConfig {
  bot: TelegramBot;
  /** URL pública HTTPS del juego (se abre como Mini App). */
  publicUrl: string;
  /** Enlace directo a la Mini App (t.me/<bot>/<app>), necesario para botones en canales. */
  appLink?: string;
  /** Canal donde se publican los anuncios automáticos (@canal o id numérico). */
  channel?: string;
  /** Secreto que Telegram envía en cada llamada al webhook. */
  webhookSecret?: string;
}

export const COMMANDS = [
  { command: 'jugar', description: 'Abrir Bellum Gentium' },
  { command: 'torneo', description: 'Ver la arena de hoy' },
  { command: 'ayuda', description: 'Cómo se juega' },
];

export const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
const usdc = (units: number) => `${(units / 1_000_000).toLocaleString('es', { maximumFractionDigits: 2 })} USDC`;
const MEDALS = ['🥇', '🥈', '🥉'];

export function playButton(cfg: TelegramConfig, text = '⚔ Jugar ahora', inChannel = false): Button {
  // En canales no se permiten botones web_app: se usa el enlace directo a la Mini App.
  if (inChannel) return { text, url: cfg.appLink ?? cfg.publicUrl };
  return { text, web_app: { url: cfg.publicUrl } };
}

export function arenaText(t: Tournament): string {
  const closes = new Date(t.closesAt).toISOString().slice(11, 16);
  return [
    `⚔️ <b>${escapeHtml(t.name)}</b> está abierta`,
    '',
    'Arma tu ejército, elige comandante y cartas, y envíalo antes del cierre. Tu ejército queda oculto y se enfrenta a todos los demás.',
    '',
    `🏆 Premio: <b>${t.sponsorPool ? usdc(poolOf(t)) : 'gloria y título de Fundador'}</b>`,
    `⏳ Cierra a las ${closes} UTC · Entrada gratis`,
  ].join('\n');
}

export function resultsText(t: Tournament, names: (id: string) => string): string {
  const standings: Standing[] = t.result?.standings ?? [];
  const prizes = new Map((t.result?.plan.payouts ?? []).map((p) => [p.id, p.amount]));
  const top = standings.slice(0, 3).map((s, i) =>
    `${MEDALS[i]} <b>${escapeHtml(names(s.id))}</b> · ${s.points} pts${prizes.has(s.id) ? ` · ${usdc(prizes.get(s.id)!)}` : ''}`);
  return [
    `🏁 <b>${escapeHtml(t.name)}</b>: resultados`,
    '',
    ...(top.length ? top : ['Nadie se inscribió esta vez.']),
    '',
    `${t.entries.length} ejércitos combatieron. Mira las repeticiones en el juego.`,
  ].join('\n');
}

/** Publica anuncios en el canal. Nunca rompe el juego: los fallos solo se registran. */
export class Announcer {
  private readonly cfg: TelegramConfig | null;
  constructor(cfg: TelegramConfig | null) {
    this.cfg = cfg;
  }

  async arenaOpened(t: Tournament): Promise<void> {
    await this.post(arenaText(t), '⚔ Inscribir mi ejército');
  }

  async closingSoon(t: Tournament): Promise<void> {
    const hours = Math.max(1, Math.round((new Date(t.closesAt).getTime() - Date.now()) / 3_600_000));
    await this.post([
      `⏳ <b>Quedan ${hours} ${hours === 1 ? 'hora' : 'horas'}</b> para el cierre de <b>${escapeHtml(t.name)}</b>`,
      '',
      `${t.entries.length} ${t.entries.length === 1 ? 'ejército inscrito' : 'ejércitos inscritos'}. Los ejércitos siguen ocultos: aún puedes sorprenderlos a todos.`,
    ].join('\n'), '⚔ Inscribirme ahora');
  }

  async tournamentClosed(t: Tournament, names: (id: string) => string): Promise<void> {
    if (!t.entries.length) return; // una arena vacía no se anuncia
    await this.post(resultsText(t, names), '⚔ Jugar la próxima');
  }

  private async post(html: string, button: string): Promise<void> {
    if (!this.cfg?.channel) return;
    try {
      await this.cfg.bot.sendMessage(this.cfg.channel, html, [[playButton(this.cfg, button, true)]]);
    } catch (err) {
      console.error('No se pudo publicar en el canal de Telegram:', (err as Error).message);
    }
  }
}

interface Update {
  message?: { chat: { id: number; type: string }; from?: { first_name?: string }; text?: string };
}

/** Ruta del webhook: Telegram envía aquí los mensajes que recibe el bot. */
export function telegramRoutes(cfg: TelegramConfig | null, store: TournamentStore, now: () => Date): Route[] {
  return [
    ['POST', /^\/api\/telegram\/webhook$/, async (req: IncomingMessage) => {
      if (!cfg?.webhookSecret) fail(503, 'Bot no configurado.');
      const given = Buffer.from(String(req.headers['x-telegram-bot-api-secret-token'] ?? ''));
      const expected = Buffer.from(cfg.webhookSecret);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) fail(401, 'Firma de webhook inválida.');
      const update = await readJson(req) as Update;
      const msg = update.message;
      if (msg?.text && msg.chat.type === 'private') {
        await reply(cfg, store, now(), msg.chat.id, msg.text, msg.from?.first_name ?? '').catch((err) => {
          console.error('Error respondiendo en Telegram:', (err as Error).message);
        });
      }
      return { ok: true };
    }],
  ];
}

async function reply(cfg: TelegramConfig, store: TournamentStore, now: Date, chat: number, text: string, first: string): Promise<void> {
  const command = text.trim().split(/[\s@]/)[0].toLowerCase();
  const play = [[playButton(cfg)]];
  if (command === '/torneo') {
    const open = store.list().find((t) => !t.result && new Date(t.closesAt) > now && t.entryFee === 0);
    await cfg.bot.sendMessage(chat, open ? arenaText(open) : 'Ahora mismo no hay arena abierta. ¡La próxima abre a medianoche UTC!', play);
    return;
  }
  if (command === '/ayuda') {
    await cfg.bot.sendMessage(chat, [
      '📜 <b>Cómo se juega</b>',
      '',
      '1. Elige una raza y un comandante.',
      '2. Coloca tus tropas con 12 de oro y prepara hasta 3 cartas.',
      '3. La batalla se resuelve sola y sin azar: gana la mejor estrategia.',
      '4. Juega la campaña e incursiones para conseguir Fichas Extrañas, sobres y comandantes.',
      '5. Inscríbete gratis en la arena diaria: los mejores ganan premios.',
    ].join('\n'), play);
    return;
  }
  // /start, /jugar o cualquier otro mensaje: bienvenida con botón para jugar.
  await cfg.bot.sendMessage(chat, [
    `⚔️ ¡Bienvenido${first ? `, ${escapeHtml(first)}` : ''}, a <b>Bellum Gentium</b>!`,
    '',
    'La guerra de los pueblos: cinco razas, comandantes legendarios y batallas de estrategia sin azar.',
    'Pulsa el botón para empezar. /torneo muestra la arena de hoy y /ayuda explica cómo se juega.',
  ].join('\n'), play);
}
