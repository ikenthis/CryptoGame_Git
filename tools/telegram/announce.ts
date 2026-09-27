// Publica anuncios en el canal de Telegram. Los anuncios diarios (arena abierta,
// cierre próximo y resultados) los publica el servidor solo; esta herramienta es
// para los mensajes puntuales: el lanzamiento, novedades o un texto propio.
//
// Uso:
//   node --env-file=.env tools/telegram/announce.ts --launch [--pin] [--dry-run]
//   node --env-file=.env tools/telegram/announce.ts --arena  [--dry-run]
//   node --env-file=.env tools/telegram/announce.ts --text "¡Nueva incursión!" [--photo https://…/imagen.webp]
import { pathToFileURL } from 'node:url';
import { TelegramBot, arenaText, playButton, type TelegramConfig } from '../../apps/server/src/telegram.ts';
import type { Tournament } from '../../apps/server/src/store.ts';

export const LAUNCH_TEXT = [
  '⚔️ <b>Bellum Gentium ya está aquí</b>',
  '',
  'La guerra de los pueblos llega a Telegram. Un juego de estrategia donde <b>no hay azar ni pagar para ganar</b>: gana quien mejor despliega su ejército.',
  '',
  '🛡 <b>5 razas</b> — humanos, elfos, enanos, orcos y no-muertos',
  '👑 <b>Comandantes legendarios</b> con habilidades únicas',
  '🐉 <b>Campaña e incursiones</b> contra jefes colosales',
  '🂠 <b>24 cartas</b> de ataque, defensa y efecto, de comunes a legendarias',
  '🏪 <b>Mercado Negro</b> y mercado entre jugadores',
  '🏆 <b>Arena diaria gratuita</b> con premios para los mejores',
  '',
  'Entrar es gratis. Pulsa el botón, elige tu raza y demuestra quién manda. 👇',
].join('\n');

export interface Args {
  mode: 'launch' | 'arena' | 'text';
  text?: string;
  photo?: string;
  pin: boolean;
  dryRun: boolean;
}

export function parseArgs(argv: string[]): Args {
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const text = value('--text');
  const mode = argv.includes('--launch') ? 'launch' : argv.includes('--arena') ? 'arena' : text ? 'text' : null;
  if (!mode) throw new Error('Indica --launch, --arena o --text "mensaje".');
  return { mode, text, photo: value('--photo'), pin: argv.includes('--pin'), dryRun: argv.includes('--dry-run') };
}

/** Busca la arena abierta en el servidor desplegado. */
export async function currentArena(publicUrl: string): Promise<Tournament> {
  const res = await fetch(`${publicUrl.replace(/\/+$/, '')}/api/tournaments`);
  if (!res.ok) throw new Error(`El servidor respondió ${res.status}.`);
  const list = await res.json() as Array<Tournament & { status: string }>;
  const arena = list.find((t) => t.status === 'open' && t.entryFee === 0);
  if (!arena) throw new Error('No hay ninguna arena abierta ahora mismo.');
  return { ...arena, entries: [] };
}

export async function announce(cfg: TelegramConfig & { channel: string }, html: string, opts: { photo?: string; pin?: boolean; button?: string } = {}): Promise<number> {
  const buttons = [[playButton(cfg, opts.button ?? '⚔ Jugar ahora', true)]];
  const msg = (opts.photo
    ? await cfg.bot.sendPhoto(cfg.channel, opts.photo, html, buttons)
    : await cfg.bot.sendMessage(cfg.channel, html, buttons)) as { message_id: number };
  if (opts.pin) await cfg.bot.call('pinChatMessage', { chat_id: cfg.channel, message_id: msg.message_id, disable_notification: false });
  return msg.message_id;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const env = process.env;
  const missing = ['TELEGRAM_BOT_TOKEN', 'PUBLIC_URL', 'TELEGRAM_CHANNEL'].filter((k) => !env[k]);
  if (missing.length && !args.dryRun) throw new Error(`Faltan variables: ${missing.join(', ')}.`);
  if (!env.TELEGRAM_APP_LINK) console.warn('Aviso: sin TELEGRAM_APP_LINK el botón abrirá la web en el navegador en lugar de la Mini App.');

  const html = args.mode === 'launch' ? LAUNCH_TEXT
    : args.mode === 'arena' ? arenaText(await currentArena(env.PUBLIC_URL!))
    : args.text!;
  if (args.dryRun) {
    console.log(`--- Vista previa (${env.TELEGRAM_CHANNEL ?? 'sin canal'}) ---\n${html}\n[botón → ${env.TELEGRAM_APP_LINK ?? env.PUBLIC_URL}]${args.photo ? `\n[imagen: ${args.photo}]` : ''}`);
    return;
  }
  const cfg = {
    bot: new TelegramBot(env.TELEGRAM_BOT_TOKEN!, env.TELEGRAM_API_BASE), publicUrl: env.PUBLIC_URL!,
    appLink: env.TELEGRAM_APP_LINK, channel: env.TELEGRAM_CHANNEL!,
  };
  const id = await announce(cfg, html, { photo: args.photo, pin: args.pin });
  console.log(`✓ Publicado en ${cfg.channel} (mensaje ${id})${args.pin ? ' y fijado' : ''}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(`✗ ${(err as Error).message}`);
    process.exit(1);
  });
}
