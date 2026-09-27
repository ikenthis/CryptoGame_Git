// Configura el bot de Telegram de una sola vez: comandos, descripción, botón de
// menú que abre la Mini App y webhook del servidor. Se puede repetir sin riesgo.
//
// Uso (con las mismas variables que el servidor):
//   node --env-file=.env tools/telegram/setup.ts            aplica la configuración
//   node --env-file=.env tools/telegram/setup.ts --dry-run  solo muestra qué haría
//   node --env-file=.env tools/telegram/setup.ts --status   estado actual del webhook
import { pathToFileURL } from 'node:url';
import { COMMANDS, TelegramBot } from '../../apps/server/src/telegram.ts';

export const DESCRIPTION = [
  '⚔️ Bellum Gentium — La guerra de los pueblos.',
  '',
  'Cinco razas, comandantes legendarios y batallas de estrategia sin azar: gana quien mejor piensa, no quien más paga.',
  '',
  '• Campaña e incursiones contra jefes para conseguir cartas y comandantes.',
  '• Arena diaria gratuita con premios para los mejores.',
  '• Mercado entre jugadores.',
  '',
  'Pulsa «Jugar» para empezar.',
].join('\n');

export const SHORT_DESCRIPTION = 'Estrategia por turnos sin azar: 5 razas, comandantes y arena diaria con premios. Gratis.';

export interface SetupConfig {
  publicUrl: string;
  webhookSecret: string;
}

export interface Step {
  method: string;
  params: Record<string, unknown>;
}

/** Valida la configuración antes de tocar nada. Devuelve los errores encontrados. */
export function checkConfig(env: Record<string, string | undefined>): string[] {
  const errors: string[] = [];
  if (!env.TELEGRAM_BOT_TOKEN) errors.push('Falta TELEGRAM_BOT_TOKEN (te lo da @BotFather).');
  if (!env.PUBLIC_URL) errors.push('Falta PUBLIC_URL (la dirección HTTPS donde está el juego).');
  else if (!/^https:\/\/[^/]+/.test(env.PUBLIC_URL)) errors.push('PUBLIC_URL debe empezar por https:// (Telegram lo exige).');
  if (!env.TELEGRAM_WEBHOOK_SECRET) errors.push('Falta TELEGRAM_WEBHOOK_SECRET (genera uno con: openssl rand -hex 32).');
  else if (!/^[A-Za-z0-9_-]{16,256}$/.test(env.TELEGRAM_WEBHOOK_SECRET)) {
    errors.push('TELEGRAM_WEBHOOK_SECRET: 16-256 caracteres, solo letras, números, "_" y "-".');
  }
  return errors;
}

/** Llamadas a la Bot API que dejan el bot listo para el lanzamiento. */
export function setupSteps(cfg: SetupConfig): Step[] {
  const base = cfg.publicUrl.replace(/\/+$/, '');
  return [
    { method: 'setMyCommands', params: { commands: COMMANDS } },
    { method: 'setMyDescription', params: { description: DESCRIPTION } },
    { method: 'setMyShortDescription', params: { short_description: SHORT_DESCRIPTION } },
    { method: 'setChatMenuButton', params: { menu_button: { type: 'web_app', text: 'Jugar', web_app: { url: `${base}/` } } } },
    {
      method: 'setWebhook',
      params: {
        url: `${base}/api/telegram/webhook`, secret_token: cfg.webhookSecret,
        allowed_updates: ['message'], drop_pending_updates: true, max_connections: 20,
      },
    },
  ];
}

export async function runSetup(bot: TelegramBot, cfg: SetupConfig, log = console.log): Promise<void> {
  const me = await bot.call<{ username: string; first_name: string }>('getMe');
  log(`Bot: @${me.username} (${me.first_name})`);
  for (const step of setupSteps(cfg)) {
    await bot.call(step.method, step.params);
    log(`✓ ${step.method}`);
  }
  const info = await bot.call<{ url: string; pending_update_count: number; last_error_message?: string }>('getWebhookInfo');
  log(`Webhook: ${info.url} (pendientes: ${info.pending_update_count})${info.last_error_message ? ` · último error: ${info.last_error_message}` : ''}`);
  log(`\nListo. Abre https://t.me/${me.username} y envía /start para probarlo.`);
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const env = process.env;
  if (args.has('--status')) {
    if (!env.TELEGRAM_BOT_TOKEN) throw new Error('Falta TELEGRAM_BOT_TOKEN.');
    const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_API_BASE);
    console.log(await bot.call('getWebhookInfo'));
    return;
  }
  const errors = checkConfig(env);
  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e}`);
    process.exit(1);
  }
  const cfg = { publicUrl: env.PUBLIC_URL!, webhookSecret: env.TELEGRAM_WEBHOOK_SECRET! };
  if (args.has('--dry-run')) {
    for (const s of setupSteps(cfg)) {
      const shown = s.method === 'setWebhook' ? { ...s.params, secret_token: '***' } : s.params;
      console.log(s.method, JSON.stringify(shown, null, 2));
    }
    return;
  }
  await runSetup(new TelegramBot(env.TELEGRAM_BOT_TOKEN!, env.TELEGRAM_API_BASE), cfg);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(`✗ ${(err as Error).message}`);
    process.exit(1);
  });
}
