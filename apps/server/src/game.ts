import { randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import {
  buyOffer, craft, distill, finishMission, missionById, mulberry32, openPack, ownsArmy, simulate, startMission, transmute,
  type CardId, type PackKind, type Profile,
} from '@gentium/engine';
import type { Session } from './auth.ts';
import { fail, readJson, requireArmy, type Route } from './http.ts';
import { MarketStore, guard } from './market.ts';
import type { ProfileStore } from './profiles.ts';

// Rutas de progresión: el servidor es la autoridad. El cliente envía intenciones
// («juega esta misión con este ejército», «abre este sobre») y el servidor
// valida, calcula y guarda. El cliente solo muestra el resultado.

export interface GameDeps {
  profiles: ProfileStore;
  market: MarketStore;
  now: () => Date;
  session: (req: IncomingMessage) => Session | null;
}

const serverRng = () => mulberry32(randomBytes(4).readUInt32LE(0));
const today = (now: Date) => now.toISOString().slice(0, 10);

export function gameRoutes({ profiles, market, now, session }: GameDeps): Route[] {
  const player = (req: IncomingMessage) => session(req) ?? fail(401, 'Inicia sesión para guardar tu progreso.');
  /** El mercado exige cuentas verificadas: evita que multicuentas pasen objetos a una principal. */
  const verified = (req: IncomingMessage) => {
    const s = player(req);
    if (!s.sub.startsWith('tg-')) fail(403, 'El mercado entre jugadores requiere entrar con Telegram.');
    return s;
  };
  const act = <T>(req: IncomingMessage, fn: (p: Profile) => { profile: Profile; value: T }) => {
    const s = player(req);
    const out = profiles.update(s.sub, s.name, now().getTime(), (p) => guard(() => fn(p)));
    return { profile: out.profile, ...out.value };
  };

  return [
    ['GET', /^\/api\/game\/profile$/, async (req) => {
      const s = player(req);
      return { playerId: s.sub, name: s.name, profile: profiles.get(s.sub, s.name, now().getTime()) };
    }],

    // Misión o incursión: la batalla se simula aquí, no se confía en el cliente.
    ['POST', /^\/api\/game\/mission$/, async (req) => {
      const body = await readJson(req) as { mission?: unknown; army?: unknown };
      const army = requireArmy(body.army);
      const id = String(body.mission ?? '');
      guard(() => missionById(id));
      return act(req, (p) => {
        const missing = ownsArmy(p, army);
        if (missing) fail(403, missing);
        const started = startMission(p, id, now().getTime());
        const result = simulate(army, missionById(id).enemy);
        const outcome = finishMission(started, id, result);
        return { profile: outcome.profile, value: { result, won: outcome.won, reward: outcome.reward, damagePct: outcome.damagePct } };
      });
    }],

    ['POST', /^\/api\/game\/pack$/, async (req) => {
      const body = await readJson(req) as { kind?: unknown };
      if (body.kind !== 'war' && body.kind !== 'commander') fail(400, 'Tipo de sobre desconocido.');
      return act(req, (p) => {
        const r = openPack(p, body.kind as PackKind, serverRng());
        return { profile: r.profile, value: { cards: r.cards, commanders: r.commanders } };
      });
    }],

    ['POST', /^\/api\/game\/transmute$/, async (req) => {
      const body = await readJson(req) as { cards?: unknown };
      if (!Array.isArray(body.cards)) fail(400, 'Indica 3 cartas.');
      return act(req, (p) => {
        const r = transmute(p, body.cards as CardId[], serverRng());
        return { profile: r.profile, value: { card: r.card } };
      });
    }],

    ['POST', /^\/api\/game\/distill$/, async (req) => {
      const body = await readJson(req) as { card?: unknown };
      return act(req, (p) => ({ profile: distill(p, String(body.card) as CardId), value: {} }));
    }],

    ['POST', /^\/api\/game\/craft$/, async (req) => {
      const body = await readJson(req) as { card?: unknown };
      return act(req, (p) => ({ profile: craft(p, String(body.card) as CardId), value: {} }));
    }],

    ['POST', /^\/api\/game\/merchant$/, async (req) => {
      const body = await readJson(req) as { offer?: unknown };
      return act(req, (p) => ({ profile: buyOffer(p, today(now()), String(body.offer)), value: {} }));
    }],

    // ---------- Mercado entre jugadores ----------

    ['GET', /^\/api\/market$/, async () => ({ listings: market.list() })],

    ['POST', /^\/api\/market\/list$/, async (req) => {
      const s = verified(req);
      const body = await readJson(req) as { item?: unknown; price?: unknown };
      return market.create(s.sub, s.name, body.item, body.price, now().getTime());
    }],

    ['POST', /^\/api\/market\/buy$/, async (req) => {
      const s = verified(req);
      const body = await readJson(req) as { id?: unknown };
      return market.buy(s.sub, s.name, String(body.id ?? ''), now().getTime());
    }],

    ['POST', /^\/api\/market\/cancel$/, async (req) => {
      const s = verified(req);
      const body = await readJson(req) as { id?: unknown };
      return { profile: market.cancel(s.sub, s.name, String(body.id ?? ''), now().getTime()) };
    }],
  ];
}
