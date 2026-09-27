import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';
import { MarketStore } from './market.ts';
import { ProfileStore } from './profiles.ts';
import { TournamentStore } from './store.ts';
import { Announcer, TelegramBot, type TelegramConfig } from './telegram.ts';

const env = process.env;
// En producción no se arranca con secretos temporales: se perderían sesiones y el acceso de admin.
if (env.NODE_ENV === 'production') {
  const missing = ['ADMIN_TOKEN', 'SESSION_SECRET', 'DATA_DIR'].filter((k) => !env[k]);
  if (missing.length) {
    console.error(`Faltan variables obligatorias en producción: ${missing.join(', ')}.`);
    process.exit(1);
  }
}
const port = Number(env.PORT ?? 8787);
const adminToken = env.ADMIN_TOKEN ?? randomBytes(16).toString('hex');
if (!env.ADMIN_TOKEN) console.log(`ADMIN_TOKEN no definido; token temporal: ${adminToken}`);

// DATA_DIR guarda todo el estado (torneos, perfiles, mercado). Sin él, se pierde al reiniciar.
const dataDir = env.DATA_DIR;
if (!dataDir) console.log('DATA_DIR no definido: los datos solo viven en memoria.');
const file = (name: string) => (dataDir ? join(dataDir, name) : undefined);
const store = new TournamentStore(env.DATA_FILE ?? file('tournaments.json'));
const profiles = new ProfileStore(file('profiles.json'));
const market = new MarketStore(profiles, file('market.json'));

const telegram: TelegramConfig | null = env.TELEGRAM_BOT_TOKEN && env.PUBLIC_URL
  ? {
    bot: new TelegramBot(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_API_BASE),
    publicUrl: env.PUBLIC_URL,
    appLink: env.TELEGRAM_APP_LINK,
    channel: env.TELEGRAM_CHANNEL,
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
  }
  : null;
const announcer = new Announcer(telegram);

// Arena diaria gratuita: se crea sola y cierra a medianoche UTC. El pozo lo
// aporta el patrocinio (DAILY_SPONSOR_POOL en unidades mínimas de USDC).
function ensureDailyArena(now: Date): void {
  const day = now.toISOString().slice(0, 10);
  const id = `arena-${day}`;
  if (store.has(id)) return;
  const closesAt = new Date(`${day}T00:00:00.000Z`);
  closesAt.setUTCDate(closesAt.getUTCDate() + 1);
  const t = store.create({
    id, name: `Arena diaria ${day}`, closesAt: closesAt.toISOString(), entryFee: 0,
    sponsorPool: Number(env.DAILY_SPONSOR_POOL ?? 0), feeBps: 0, cardPool: 'open',
  });
  console.log(`Arena abierta: ${id}`);
  void announcer.arenaOpened(t);
}

// Recordatorio en el canal cuando faltan 2 horas para el cierre de la arena.
const REMINDER_MS = 2 * 3_600_000;
const reminded = new Set<string>();

async function tick(): Promise<void> {
  const now = new Date();
  for (const t of store.list()) {
    const left = new Date(t.closesAt).getTime() - now.getTime();
    // Ventana de 5 minutos: un reinicio del servidor fuera de ella no repite el aviso.
    if (!t.result && t.entryFee === 0 && left <= REMINDER_MS && left > REMINDER_MS - 300_000 && !reminded.has(t.id)) {
      reminded.add(t.id);
      await announcer.closingSoon(t);
    }
  }
  for (const id of store.closeDue(now)) {
    console.log(`Torneo cerrado: ${id}`);
    // Primero los resultados y después la nueva arena, para que el canal lea en orden.
    await announcer.tournamentClosed(store.get(id), (p) => profiles.name(p));
  }
  ensureDailyArena(now);
}
void tick();
setInterval(() => void tick(), 30_000);

const sessionSecret = env.SESSION_SECRET ?? randomBytes(32).toString('hex');
if (!env.SESSION_SECRET) console.log('SESSION_SECRET no definido: las sesiones caducarán al reiniciar el servidor.');
const webDist = env.WEB_DIST ?? fileURLToPath(new URL('../../web/dist', import.meta.url));

const server = createApp({
  store,
  profiles,
  market,
  telegram,
  adminToken,
  sessionSecret,
  telegramBotToken: env.TELEGRAM_BOT_TOKEN,
  requireAuth: env.REQUIRE_AUTH === '1',
  rateLimit: Number(env.RATE_LIMIT ?? 120),
  trustProxy: env.TRUST_PROXY === '1',
  staticDir: existsSync(webDist) ? webDist : undefined,
}).listen(port, () => {
  console.log(`Bellum Gentium API en http://localhost:${port}`);
  if (existsSync(webDist)) console.log(`Sirviendo el cliente compilado desde ${webDist}`);
  if (!env.TELEGRAM_BOT_TOKEN) console.log('TELEGRAM_BOT_TOKEN no definido: el inicio de sesión con Telegram está desactivado.');
  else if (!telegram) console.log('PUBLIC_URL no definido: el bot de Telegram no responderá ni publicará anuncios.');
});

// Parada limpia (despliegues y reinicios): los datos ya están guardados en cada cambio.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`${signal} recibido: cerrando el servidor.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  });
}
