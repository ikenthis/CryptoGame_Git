import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import {
  ARMORS, BOARD_HEIGHT, BOARD_WIDTH, BUDGET, CARDS, CARD_TURN_MAX, DEPLOY_COLUMNS, ENERGY, MAX_CARDS, MAX_FEE_BPS,
  MAX_TURNS, MAX_UNITS, PRESET_ARMIES, RACES, UNITS, simulate, validateArmy, type Army,
} from '@gentium/engine';
import { signSession, verifySession, verifyTelegramInitData, type Session } from './auth.ts';
import { serveStatic } from './static.ts';
import { StoreError, commitmentFor, poolOf, type Tournament, type TournamentStore } from './store.ts';

export interface AppOptions {
  store: TournamentStore;
  adminToken: string;
  now?: () => Date;
  /**
   * Comprueba que el jugador pagó la entrada (evento `Entered` del contrato con
   * este mismo commitment). Sin verificador, los torneos de pago no aceptan
   * inscripciones: es preferible fallar cerrado a regalar plazas.
   */
  verifyEntryPayment?: (t: Tournament, playerId: string, commitment: string, paymentTx: unknown) => Promise<boolean>;
  /** Comprueba que el jugador posee las cartas que usa (torneos con cardPool 'owned'). */
  verifyCardOwnership?: (playerId: string, army: Army) => Promise<boolean>;
  /** Token del bot de Telegram para validar el initData de la Mini App. */
  telegramBotToken?: string;
  /** Secreto para firmar las sesiones de jugador. */
  sessionSecret?: string;
  /** Si es true, las inscripciones exigen sesión (no se aceptan nombres anónimos). */
  requireAuth?: boolean;
  /** Carpeta del cliente compilado para servirlo junto a la API. */
  staticDir?: string;
}

const MAX_BODY_BYTES = 16 * 1024;
// Hasta 42 caracteres para admitir direcciones de wallet (0x…) en torneos de pago.
const PLAYER_ID = /^[A-Za-z0-9_-]{3,42}$/;
const TOURNAMENT_ID = /^[a-z0-9-]{3,48}$/;
const SALT = /^[0-9a-f]{32}$/;
const WALLET = /^0x[0-9a-fA-F]{40}$/;

/** Respuesta que no es JSON (p. ej. CSV). */
class Raw {
  readonly body: string;
  readonly type: string;
  constructor(body: string, type: string) {
    this.body = body;
    this.type = type;
  }
}
/** Prefijo reservado a identidades verificadas: un jugador anónimo no puede usarlo. */
const VERIFIED_PREFIX = 'tg-';

export function createApp(options: AppOptions): Server {
  const { store } = options;
  const now = options.now ?? (() => new Date());

  const routes: Array<[string, RegExp, (req: IncomingMessage, params: string[], url: URL) => Promise<unknown>]> = [
    ['GET', /^\/api\/health$/, async () => ({ ok: true })],

    // Inicio de sesión desde la Mini App de Telegram.
    ['POST', /^\/api\/auth\/telegram$/, async (req) => {
      if (!options.telegramBotToken || !options.sessionSecret) fail(503, 'El inicio de sesión con Telegram no está configurado.');
      const body = await readJson(req) as { initData?: unknown };
      const user = verifyTelegramInitData(String(body.initData ?? ''), options.telegramBotToken, now());
      if (!user) fail(401, 'Datos de Telegram inválidos o caducados.');
      const playerId = `${VERIFIED_PREFIX}${user.id}`;
      const name = (user.username ?? [user.first_name, user.last_name].filter(Boolean).join(' ')) || playerId;
      return { playerId, name, token: signSession(playerId, name, options.sessionSecret, now()) };
    }],

    ['GET', /^\/api\/me$/, async (req) => sessionFrom(req) ?? fail(401, 'Sin sesión.')],

    ['GET', /^\/api\/config$/, async () => ({
      board: { width: BOARD_WIDTH, height: BOARD_HEIGHT, deployColumns: DEPLOY_COLUMNS },
      budget: BUDGET, maxUnits: MAX_UNITS, maxTurns: MAX_TURNS, units: UNITS,
      energy: ENERGY, maxCards: MAX_CARDS, cardTurnMax: CARD_TURN_MAX, races: RACES, cards: CARDS, armors: ARMORS,
      presets: Object.fromEntries(Object.entries(PRESET_ARMIES).map(([id, p]) => [id, p.name])),
    })],

    // Práctica: simula contra un preset de la IA o contra un ejército dado.
    ['POST', /^\/api\/simulate$/, async (req) => {
      const body = await readJson(req) as { army?: unknown; opponent?: unknown };
      const army = requireArmy(body.army);
      const opponent = typeof body.opponent === 'string'
        ? PRESET_ARMIES[body.opponent]?.army ?? fail(400, 'Rival desconocido.')
        : requireArmy(body.opponent);
      return simulate(army, opponent);
    }],

    ['GET', /^\/api\/tournaments$/, async () => store.list().map((t) => publicView(t, now()))],

    ['POST', /^\/api\/tournaments$/, async (req) => {
      requireAdmin(req, options.adminToken);
      const body = await readJson(req) as Record<string, unknown>;
      const id = String(body.id ?? '');
      if (!TOURNAMENT_ID.test(id)) fail(400, 'Id de torneo inválido.');
      const closesAt = new Date(String(body.closesAt ?? ''));
      if (Number.isNaN(closesAt.getTime()) || closesAt <= now()) fail(400, 'closesAt debe ser una fecha futura.');
      const entryFee = nonNegativeInt(body.entryFee ?? 0, 'entryFee');
      const sponsorPool = nonNegativeInt(body.sponsorPool ?? 0, 'sponsorPool');
      const feeBps = nonNegativeInt(body.feeBps ?? 0, 'feeBps');
      if (feeBps > MAX_FEE_BPS) fail(400, `feeBps máximo: ${MAX_FEE_BPS}.`);
      const cardPool = body.cardPool ?? 'open';
      if (cardPool !== 'open' && cardPool !== 'owned') fail(400, "cardPool debe ser 'open' u 'owned'.");
      const t = store.create({
        id, name: String(body.name ?? id).slice(0, 80), closesAt: closesAt.toISOString(), entryFee, sponsorPool, feeBps, cardPool,
      });
      return publicView(t, now());
    }],

    ['GET', /^\/api\/tournaments\/([^/]+)$/, async (_req, [id]) => publicView(store.get(id), now(), true)],

    ['POST', /^\/api\/tournaments\/([^/]+)\/entries$/, async (req, [id]) => {
      const body = await readJson(req) as { playerId?: unknown; army?: unknown; salt?: unknown; paymentTx?: unknown; wallet?: unknown };
      const wallet = body.wallet ? String(body.wallet).trim() : undefined;
      if (wallet && !WALLET.test(wallet)) fail(400, 'La wallet debe ser una dirección 0x de 40 caracteres hexadecimales.');
      // Con sesión, la identidad sale del token y no del cuerpo de la petición.
      const session = sessionFrom(req);
      if (!session && options.requireAuth) fail(401, 'Inicia sesión para inscribirte.');
      const playerId = session?.sub ?? String(body.playerId ?? '');
      if (!PLAYER_ID.test(playerId)) fail(400, 'playerId: 3-42 caracteres alfanuméricos, "-" o "_".');
      if (!session && playerId.startsWith(VERIFIED_PREFIX)) fail(400, `Los nombres que empiezan por "${VERIFIED_PREFIX}" están reservados.`);
      const army = requireArmy(body.army);
      const t = store.get(id);
      if (t.cardPool === 'owned' && (army.cards ?? []).length > 0) {
        if (!options.verifyCardOwnership) fail(503, 'Los torneos con cartas propias aún no están habilitados.');
        if (!(await options.verifyCardOwnership(playerId, army))) fail(403, 'No posees alguna de las cartas elegidas.');
      }
      let salt: string | undefined;
      if (t.entryFee > 0) {
        // Torneo de pago: el cliente genera la sal, calcula el commitment, paga
        // on-chain con él y luego envía aquí ejército + sal + tx. Se verifica
        // el pago ANTES de guardar nada.
        if (!options.verifyEntryPayment) fail(503, 'Los torneos de pago aún no están habilitados.');
        if (typeof body.salt !== 'string' || !SALT.test(body.salt)) fail(400, 'salt: 32 caracteres hexadecimales.');
        salt = body.salt;
        const commitment = commitmentFor(id, playerId, army, salt);
        if (!(await options.verifyEntryPayment(t, playerId, commitment, body.paymentTx))) {
          fail(402, 'No se encontró el pago de la entrada.');
        }
      }
      const entry = store.enter(id, playerId, army, now(), salt, wallet);
      return { playerId, submittedAt: entry.submittedAt, commitment: entry.commitment, salt: entry.salt };
    }],

    // Lista de pagos para el organizador: quién cobra, cuánto y en qué wallet.
    ['GET', /^\/api\/tournaments\/([^/]+)\/payouts\.csv$/, async (req, [id]) => {
      requireAdmin(req, options.adminToken);
      const t = store.get(id);
      if (!t.result) fail(409, 'El torneo aún no está cerrado.');
      const wallets = new Map(t.entries.map((e) => [e.playerId, e.wallet ?? '']));
      const ranks = new Map(t.result.standings.map((s) => [s.id, s.rank]));
      const rows = t.result.plan.payouts.map((p) => [ranks.get(p.id), p.id, wallets.get(p.id) || 'SIN WALLET', (p.amount / 1_000_000).toFixed(6)].join(','));
      return new Raw(['puesto,jugador,wallet,usdc', ...rows].join('\n') + '\n', 'text/csv; charset=utf-8');
    }],

    ['POST', /^\/api\/tournaments\/([^/]+)\/close$/, async (req, [id]) => {
      requireAdmin(req, options.adminToken);
      return publicView(store.close(id, now()), now(), true);
    }],

    // Repetición de cualquier partida del torneo, solo tras el cierre.
    ['GET', /^\/api\/tournaments\/([^/]+)\/replay$/, async (_req, [id], url) => {
      const t = store.get(id);
      if (!t.result) fail(403, 'Las partidas se revelan al cerrar el torneo.');
      const find = (p: string | null) => t.entries.find((e) => e.playerId === p)?.army ?? fail(404, `Jugador ${p} no inscrito.`);
      return simulate(find(url.searchParams.get('left')), find(url.searchParams.get('right')));
    }],
  ];

  function sessionFrom(req: IncomingMessage): Session | null {
    const header = String(req.headers.authorization ?? '');
    if (!header.startsWith('Bearer ') || !options.sessionSecret) return null;
    return verifySession(header.slice(7), options.sessionSecret, now());
  }

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      for (const [method, pattern, handler] of routes) {
        const match = pattern.exec(url.pathname);
        if (!match || req.method !== method) continue;
        const out = await handler(req, match.slice(1).map(decodeURIComponent), url);
        if (out instanceof Raw) {
          res.writeHead(200, { 'content-type': out.type });
          res.end(out.body);
        } else send(res, 200, out);
        return;
      }
      if (!url.pathname.startsWith('/api/') && options.staticDir && await serveStatic(options.staticDir, req, res, url.pathname)) return;
      send(res, 404, { error: 'Ruta no encontrada.' });
    } catch (err) {
      if (err instanceof StoreError) send(res, err.status, { error: err.message });
      else {
        console.error(err);
        send(res, 500, { error: 'Error interno.' });
      }
    }
  });
}

/** Mientras el torneo está abierto se ocultan los ejércitos (nadie puede copiar ni contraatacar). */
function publicView(t: Tournament, now: Date, detailed = false) {
  const base = {
    id: t.id, name: t.name, closesAt: t.closesAt, entryFee: t.entryFee, sponsorPool: t.sponsorPool, feeBps: t.feeBps,
    cardPool: t.cardPool ?? 'open',
    status: t.result ? 'closed' : now >= new Date(t.closesAt) ? 'closing' : 'open',
    entryCount: t.entries.length, pool: poolOf(t),
  };
  if (!detailed) return base;
  if (!t.result) return { ...base, commitments: t.entries.map((e) => ({ playerId: e.playerId, commitment: e.commitment })) };
  // Las wallets son privadas: solo salen en el CSV del organizador.
  return { ...base, result: t.result, entries: t.entries.map(({ wallet: _wallet, ...e }) => e) };
}

function requireArmy(input: unknown): Army {
  const check = validateArmy(input);
  if (!check.ok) fail(400, check.error);
  return check.army;
}

function requireAdmin(req: IncomingMessage, token: string): void {
  const given = Buffer.from(String(req.headers.authorization ?? ''));
  const expected = Buffer.from(`Bearer ${token}`);
  if (!token || given.length !== expected.length || !timingSafeEqual(given, expected)) fail(401, 'No autorizado.');
}

function nonNegativeInt(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(400, `${field} debe ser un entero no negativo.`);
  return value as number;
}

function fail(status: number, message: string): never {
  throw new StoreError(status, message);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) fail(413, 'Cuerpo demasiado grande.');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    fail(400, 'JSON inválido.');
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
