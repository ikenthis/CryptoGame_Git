import {
  buyOffer, craft, distill, finishMission, openPack, simulate, startMission, transmute,
  type Army, type BattleResult, type CardId, type CommanderId, type MarketItem, type MissionOutcome, type PackKind, type Profile,
} from '@gentium/engine';
import { getProfile, rng, setProfile, today, useServerProfile } from './profile.ts';

// Capa de acceso al juego. Con sesión, cada acción es una petición al servidor,
// que valida, calcula y guarda (nadie puede fabricarse cartas en su navegador).
// Sin servidor (la demo publicada), las mismas funciones del motor corren aquí.

export interface Session { token: string; playerId: string; name: string }

export type Action =
  | { type: 'pack'; kind: PackKind }
  | { type: 'transmute'; cards: CardId[] }
  | { type: 'distill'; card: CardId }
  | { type: 'craft'; card: CardId }
  | { type: 'merchant'; offer: string };

export interface ActionResult { cards?: CardId[]; commanders?: CommanderId[]; card?: CardId }

export interface MissionRun {
  result: BattleResult;
  /** Se llama al terminar la animación: entrega (o confirma) las recompensas. */
  finish(): Omit<MissionOutcome, 'profile'>;
}

export interface Listing {
  id: string; seller: string; sellerName: string; item: MarketItem; label: string; price: number; createdAt: number;
}

let session: Session | null = null;

export const getSession = () => session;
export const online = () => session !== null;
/** Solo las cuentas de Telegram pueden comerciar con otros jugadores. */
export const verified = () => session?.playerId.startsWith('tg-') ?? false;

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (session) headers.authorization = `Bearer ${session.token}`;
  const res = await fetch(path, { ...init, headers });
  const body = await res.json().catch(() => ({ error: `Error ${res.status}` }));
  if (!res.ok) throw Object.assign(new Error(body.error ?? `Error ${res.status}`), { status: res.status });
  return body as T;
}

const post = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });

/** Activa una sesión y descarga el perfil del servidor. */
export async function connect(s: Session): Promise<void> {
  session = s;
  const { profile } = await api<{ profile: Profile }>('/api/game/profile');
  useServerProfile(profile);
}

const GUEST_KEY = 'gentium.session';

/** Fuera de Telegram: sesión de invitado guardada en el navegador (se crea la primera vez). */
export async function connectGuest(): Promise<boolean> {
  let saved: Session | null = null;
  try { saved = JSON.parse(localStorage.getItem(GUEST_KEY) ?? 'null'); } catch { /* sin almacenamiento */ }
  try {
    if (saved) {
      try {
        await connect(saved);
        return true;
      } catch (err) {
        if ((err as { status?: number }).status !== 401) throw err;
        session = null; // sesión caducada: se crea otra
      }
    }
    const fresh = await post<Session>('/api/auth/guest', {});
    try { localStorage.setItem(GUEST_KEY, JSON.stringify(fresh)); } catch { /* opcional */ }
    await connect(fresh);
    return true;
  } catch {
    session = null; // sin servidor: se juega en modo local
    return false;
  }
}

export async function perform(action: Action): Promise<ActionResult> {
  if (session) {
    const { type, ...body } = action;
    const out = await post<ActionResult & { profile: Profile }>(`/api/game/${type}`, body);
    setProfile(out.profile);
    return out;
  }
  const p = getProfile();
  switch (action.type) {
    case 'pack': { const r = openPack(p, action.kind, rng()); setProfile(r.profile); return r; }
    case 'transmute': { const r = transmute(p, action.cards, rng()); setProfile(r.profile); return { card: r.card }; }
    case 'distill': setProfile(distill(p, action.card)); return {};
    case 'craft': setProfile(craft(p, action.card)); return {};
    case 'merchant': setProfile(buyOffer(p, today(), action.offer)); return {};
  }
}

/** Juega una misión: con servidor, la batalla se resuelve allí y aquí solo se anima. */
export async function playMission(id: string, army: Army, enemy: Parameters<typeof simulate>[1]): Promise<MissionRun> {
  if (session) {
    const out = await post<{ profile: Profile; result: BattleResult } & Omit<MissionOutcome, 'profile'>>('/api/game/mission', { mission: id, army });
    return { result: out.result, finish: () => { setProfile(out.profile); return out; } };
  }
  setProfile(startMission(getProfile(), id, Date.now()));
  const result = simulate(army, enemy);
  return { result, finish: () => { const o = finishMission(getProfile(), id, result); setProfile(o.profile); return o; } };
}

// ---------- Mercado entre jugadores ----------

export const market = {
  list: () => api<{ listings: Listing[] }>('/api/market').then((r) => r.listings),
  async sell(item: MarketItem, price: number): Promise<void> {
    setProfile((await post<{ profile: Profile }>('/api/market/list', { item, price })).profile);
  },
  async buy(id: string): Promise<Listing> {
    const out = await post<{ profile: Profile; listing: Listing }>('/api/market/buy', { id });
    setProfile(out.profile);
    return out.listing;
  },
  async cancel(id: string): Promise<void> {
    setProfile((await post<{ profile: Profile }>('/api/market/cancel', { id })).profile);
  },
};
