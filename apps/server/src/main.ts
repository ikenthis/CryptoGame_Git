import { randomBytes } from 'node:crypto';
import { createApp } from './app.ts';
import { TournamentStore } from './store.ts';

const port = Number(process.env.PORT ?? 8787);
const adminToken = process.env.ADMIN_TOKEN ?? randomBytes(16).toString('hex');
if (!process.env.ADMIN_TOKEN) console.log(`ADMIN_TOKEN no definido; token temporal: ${adminToken}`);

const store = new TournamentStore(process.env.DATA_FILE);

// Arena diaria gratuita: se crea sola y cierra a medianoche UTC. El pozo lo
// aporta el patrocinio (DAILY_SPONSOR_POOL en unidades mínimas de USDC).
function ensureDailyArena(now: Date): void {
  const day = now.toISOString().slice(0, 10);
  const id = `arena-${day}`;
  if (store.has(id)) return;
  const closesAt = new Date(`${day}T00:00:00.000Z`);
  closesAt.setUTCDate(closesAt.getUTCDate() + 1);
  store.create({
    id, name: `Arena diaria ${day}`, closesAt: closesAt.toISOString(), entryFee: 0,
    sponsorPool: Number(process.env.DAILY_SPONSOR_POOL ?? 0), feeBps: 0,
  });
}

function tick(): void {
  const now = new Date();
  for (const id of store.closeDue(now)) console.log(`Torneo cerrado: ${id}`);
  ensureDailyArena(now);
}
tick();
setInterval(tick, 30_000);

createApp({ store, adminToken }).listen(port, () => console.log(`Bastión API en http://localhost:${port}`));
