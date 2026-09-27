import type { BattleArmy } from './army.ts';
import type { BattleResult } from './battle.ts';
import { CARDS, CARD_IDS, RARITIES, type CardId, type Rarity } from './cards.ts';
import { COMMANDERS, COMMANDER_IDS, type CommanderId } from './commanders.ts';

// Progresión fuera de la batalla: recursos, colección, campaña, incursiones,
// sobres, transmutación y mercader. Funciones puras: reciben un perfil y
// devuelven uno nuevo, así el servidor puede ejecutar exactamente lo mismo.
//
// Regla de diseño (legal): los sobres solo se abren con Fichas Extrañas, que se
// ganan jugando y NO se compran ni se intercambian. Así un sobre aleatorio nunca
// se paga con dinero (no es una caja de botín de pago).

export type Resource = 'gold' | 'iron' | 'crystal' | 'bone' | 'tokens' | 'essence' | 'supplies';

export const RESOURCES: Record<Resource, { name: string; icon: string; tradable: boolean }> = {
  gold: { name: 'Oro de guerra', icon: '🪙', tradable: true },
  iron: { name: 'Hierro', icon: '⛓', tradable: true },
  crystal: { name: 'Cristal arcano', icon: '🔷', tradable: true },
  bone: { name: 'Hueso antiguo', icon: '🦴', tradable: true },
  tokens: { name: 'Fichas Extrañas', icon: '🜏', tradable: false },
  essence: { name: 'Esencia', icon: '✦', tradable: false },
  supplies: { name: 'Provisiones', icon: '🍖', tradable: false },
};

export const RESOURCE_IDS = Object.keys(RESOURCES) as Resource[];
export const MAX_SUPPLIES = 10;
export const SUPPLY_EVERY_MS = 20 * 60 * 1000;

export interface Profile {
  version: 1;
  resources: Record<Resource, number>;
  cards: Partial<Record<CardId, number>>;
  commanders: Partial<Record<CommanderId, number>>;
  /** Misiones completadas al menos una vez. */
  cleared: string[];
  /** Mejor porcentaje de daño a cada jefe (0–100). */
  raidBest: Record<string, number>;
  /** Ofertas del mercader compradas, por día. */
  merchant: { day: string; bought: string[] };
  /** Momento del último cálculo de provisiones (ms). */
  suppliesAt: number;
}

export interface Reward {
  resources?: Partial<Record<Resource, number>>;
  cards?: CardId[];
  commanders?: CommanderId[];
}

// ---------- Perfil ----------

/** Comandante inicial de cada raza (el de menor rareza) y todas las cartas comunes. */
export function newProfile(now: number): Profile {
  const starters: CommanderId[] = ['aldric', 'lyra', 'grok', 'velka', 'borin'];
  return {
    version: 1,
    resources: { gold: 100, iron: 0, crystal: 0, bone: 0, tokens: 10, essence: 0, supplies: MAX_SUPPLIES },
    cards: Object.fromEntries(CARD_IDS.filter((id) => CARDS[id].rarity === 'common').map((id) => [id, 1])),
    commanders: Object.fromEntries(starters.map((id) => [id, 1])),
    cleared: [],
    raidBest: {},
    merchant: { day: '', bought: [] },
    suppliesAt: now,
  };
}

function clone(p: Profile): Profile {
  return structuredClone(p);
}

export class MetaError extends Error {}

function fail(message: string): never {
  throw new MetaError(message);
}

/** Recupera provisiones con el tiempo (1 cada 20 minutos, máximo 10). */
export function refreshSupplies(profile: Profile, now: number): Profile {
  const p = clone(profile);
  if (p.resources.supplies >= MAX_SUPPLIES) {
    p.suppliesAt = now;
    return p;
  }
  const gained = Math.floor((now - p.suppliesAt) / SUPPLY_EVERY_MS);
  if (gained <= 0) return p;
  p.resources.supplies = Math.min(MAX_SUPPLIES, p.resources.supplies + gained);
  p.suppliesAt = p.resources.supplies >= MAX_SUPPLIES ? now : p.suppliesAt + gained * SUPPLY_EVERY_MS;
  return p;
}

export function canAfford(profile: Profile, cost: Partial<Record<Resource, number>>): boolean {
  return Object.entries(cost).every(([r, n]) => profile.resources[r as Resource] >= (n ?? 0));
}

function pay(p: Profile, cost: Partial<Record<Resource, number>>): void {
  if (!canAfford(p, cost)) fail('No tienes recursos suficientes.');
  for (const [r, n] of Object.entries(cost)) p.resources[r as Resource] -= n ?? 0;
}

export function grant(profile: Profile, reward: Reward): Profile {
  const p = clone(profile);
  for (const [r, n] of Object.entries(reward.resources ?? {})) p.resources[r as Resource] += n ?? 0;
  for (const c of reward.cards ?? []) p.cards[c] = (p.cards[c] ?? 0) + 1;
  for (const c of reward.commanders ?? []) p.commanders[c] = (p.commanders[c] ?? 0) + 1;
  return p;
}

export function ownsCard(profile: Profile, id: CardId): boolean {
  return (profile.cards[id] ?? 0) > 0;
}

export function ownsCommander(profile: Profile, id: CommanderId): boolean {
  return (profile.commanders[id] ?? 0) > 0;
}

// ---------- Campaña e incursiones ----------

export interface Mission {
  id: string;
  kind: 'mission' | 'raid';
  chapter: string;
  name: string;
  text: string;
  cost: number;
  enemy: BattleArmy;
  /** Recompensa por cada victoria. */
  reward: Reward;
  /** Recompensa extra solo la primera vez. */
  firstClear?: Reward;
  requires?: string;
}

export const MISSIONS: Mission[] = [
  {
    id: 'vado', kind: 'mission', chapter: 'I · Frontera de Aurelia', name: 'Emboscada en el Vado', cost: 1,
    text: 'Saqueadores orcos cruzan el río. Detenlos antes de que lleguen a las granjas.',
    enemy: { race: 'orc', units: [{ type: 'warrior', x: 2, y: 1 }, { type: 'warrior', x: 2, y: 3 }, { type: 'archer', x: 0, y: 2 }] },
    reward: { resources: { gold: 20, iron: 4 } },
    firstClear: { resources: { tokens: 5 }, cards: ['shield-wall'] },
  },
  {
    id: 'torre', kind: 'mission', chapter: 'I · Frontera de Aurelia', name: 'La Torre Quemada', cost: 1, requires: 'vado',
    text: 'Grok el Rompehuesos ha tomado la torre del vigía. Recupérala.',
    enemy: {
      race: 'orc', commander: { id: 'grok', x: 1, y: 2 },
      units: [{ type: 'warrior', x: 2, y: 1 }, { type: 'warrior', x: 2, y: 2 }, { type: 'warrior', x: 2, y: 3 }, { type: 'archer', x: 0, y: 1 }],
    },
    reward: { resources: { gold: 25, iron: 6 } },
    firstClear: { resources: { tokens: 6 }, cards: ['armor-break', 'war-cry'] },
  },
  {
    id: 'claro', kind: 'mission', chapter: 'II · Bosque de Sylvaran', name: 'El Claro de Plata', cost: 2, requires: 'torre',
    text: 'Los elfos no dejan pasar a nadie. Demuestra que eres digno.',
    enemy: {
      race: 'elf', commander: { id: 'lyra', x: 0, y: 2 },
      units: [{ type: 'archer', x: 0, y: 1 }, { type: 'archer', x: 0, y: 4 }, { type: 'guardian', x: 2, y: 2 }, { type: 'healer', x: 1, y: 3 }],
      cards: [{ card: 'frost-bind', turn: 2 }],
    },
    reward: { resources: { gold: 30, crystal: 4 } },
    firstClear: { resources: { tokens: 8 }, cards: ['arcane-barrier'] },
  },
  {
    id: 'raices', kind: 'mission', chapter: 'II · Bosque de Sylvaran', name: 'Raíces Envenenadas', cost: 2, requires: 'claro',
    text: 'Algo pudre el bosque desde dentro. Una nigromante camina entre los árboles.',
    enemy: {
      race: 'undead', commander: { id: 'velka', x: 0, y: 3 },
      units: [{ type: 'warrior', x: 2, y: 1 }, { type: 'warrior', x: 2, y: 4 }, { type: 'mage', x: 1, y: 2 }, { type: 'guardian', x: 2, y: 3 }],
      cards: [{ card: 'poison-cloud', turn: 2 }],
    },
    reward: { resources: { gold: 35, bone: 5 } },
    firstClear: { resources: { tokens: 10 }, cards: ['poison-cloud'], commanders: ['thalanor'] },
  },
  {
    id: 'forja', kind: 'mission', chapter: 'III · Montañas de Durnhal', name: 'La Forja Sitiada', cost: 2, requires: 'raices',
    text: 'Los enanos resisten en su forja. Rompe el cerco… o únete a él.',
    enemy: {
      race: 'dwarf', commander: { id: 'borin', x: 1, y: 2 },
      units: [{ type: 'guardian', x: 2, y: 1 }, { type: 'guardian', x: 2, y: 4 }, { type: 'archer', x: 0, y: 2 }, { type: 'warrior', x: 2, y: 2 }],
      cards: [{ card: 'bulwark', turn: 3 }],
    },
    reward: { resources: { gold: 40, iron: 10 } },
    firstClear: { resources: { tokens: 12 }, cards: ['thorn-armor'] },
  },
  {
    id: 'trono', kind: 'mission', chapter: 'III · Montañas de Durnhal', name: 'El Trono de Hierro', cost: 3, requires: 'forja',
    text: 'Brunhild la Forjarunas te espera en su salón. No suele perder.',
    enemy: {
      race: 'dwarf', commander: { id: 'brunhild', x: 1, y: 3 },
      units: [{ type: 'guardian', x: 2, y: 2 }, { type: 'knight', x: 2, y: 4 }, { type: 'archer', x: 0, y: 1 }, { type: 'archer', x: 0, y: 4 }],
      cards: [{ card: 'earthquake', turn: 3 }, { card: 'shield-wall', turn: 1 }],
    },
    reward: { resources: { gold: 50, iron: 8, crystal: 4 } },
    firstClear: { resources: { tokens: 15 }, cards: ['earthquake'], commanders: ['brunhild'] },
  },
  {
    id: 'guarida', kind: 'raid', chapter: 'Incursión', name: 'Guarida de Vermithrax', cost: 3, requires: 'torre',
    text: 'El Dragón de Ceniza ha despertado. No hace falta vencerlo: cuanto más daño le hagas, más botín.',
    enemy: {
      race: 'orc', bosses: [{ id: 'ash-dragon', x: 1, y: 2 }],
      units: [{ type: 'warrior', x: 2, y: 1 }, { type: 'warrior', x: 2, y: 4 }],
    },
    reward: { resources: { crystal: 6, bone: 6 } },
  },
  {
    id: 'grieta', kind: 'raid', chapter: 'Incursión', name: 'La Grieta del Vacío', cost: 3, requires: 'raices',
    text: 'Xal-Azar atraviesa el velo entre mundos. Cada golpe cuenta.',
    enemy: {
      race: 'undead', bosses: [{ id: 'void-colossus', x: 1, y: 3 }],
      units: [{ type: 'mage', x: 0, y: 1 }, { type: 'warrior', x: 2, y: 2 }, { type: 'warrior', x: 2, y: 4 }],
    },
    reward: { resources: { crystal: 8, iron: 8 } },
  },
];

export function missionById(id: string): Mission {
  return MISSIONS.find((m) => m.id === id) ?? fail('Misión desconocida.');
}

export function missionUnlocked(profile: Profile, mission: Mission): boolean {
  return !mission.requires || profile.cleared.includes(mission.requires);
}

/** Gasta provisiones para empezar una misión. */
export function startMission(profile: Profile, id: string, now: number): Profile {
  const mission = missionById(id);
  const p = refreshSupplies(profile, now);
  if (!missionUnlocked(p, mission)) fail('Esta misión aún está bloqueada.');
  if (p.resources.supplies < mission.cost) fail('No tienes provisiones suficientes. Se recuperan con el tiempo.');
  p.resources.supplies -= mission.cost;
  return p;
}

export interface MissionOutcome {
  profile: Profile;
  won: boolean;
  reward: Reward;
  /** Solo incursiones: porcentaje de vida quitada al jefe. */
  damagePct?: number;
}

/** Aplica las recompensas según el resultado de la batalla (el jugador es el lado 0). */
export function finishMission(profile: Profile, id: string, result: BattleResult): MissionOutcome {
  const mission = missionById(id);
  const won = result.winner === 0;
  if (mission.kind === 'raid') {
    const pct = result.bossHp ? Math.min(100, Math.round((100 * result.bossDamage) / result.bossHp)) : 0;
    const scale = (n: number) => Math.round((n * pct) / 100);
    const base = Object.fromEntries(Object.entries(mission.reward.resources ?? {}).map(([r, n]) => [r, scale(n ?? 0)]));
    const reward: Reward = { resources: { ...base, tokens: 2 + Math.floor(pct / 10) + (won ? 10 : 0) } };
    let p = grant(profile, reward);
    p.raidBest[id] = Math.max(p.raidBest[id] ?? 0, pct);
    if (won && !p.cleared.includes(id)) p = { ...p, cleared: [...p.cleared, id] };
    return { profile: p, won, reward, damagePct: pct };
  }
  if (!won) return { profile, won, reward: { resources: { gold: 5 } } };
  const first = !profile.cleared.includes(id) && mission.firstClear;
  const reward = mergeRewards(mission.reward, first ? mission.firstClear! : {});
  const p = grant(profile, reward);
  if (!p.cleared.includes(id)) p.cleared.push(id);
  return { profile: p, won, reward };
}

function mergeRewards(a: Reward, b: Reward): Reward {
  const resources: Partial<Record<Resource, number>> = { ...a.resources };
  for (const [r, n] of Object.entries(b.resources ?? {})) resources[r as Resource] = (resources[r as Resource] ?? 0) + (n ?? 0);
  return { resources, cards: [...(a.cards ?? []), ...(b.cards ?? [])], commanders: [...(a.commanders ?? []), ...(b.commanders ?? [])] };
}

// ---------- Sobres ----------

export type PackKind = 'war' | 'commander';

export interface PackDef {
  kind: PackKind;
  name: string;
  text: string;
  cost: Partial<Record<Resource, number>>;
  size: number;
  /** Probabilidades publicadas, en porcentaje. */
  odds: Record<Rarity, number>;
}

export const PACKS: Record<PackKind, PackDef> = {
  war: {
    kind: 'war', name: 'Sobre de Guerra', text: '3 cartas.', cost: { tokens: 5 }, size: 3,
    odds: { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 },
  },
  commander: {
    kind: 'commander', name: 'Sobre de Comandante', text: '1 comandante.', cost: { tokens: 15 }, size: 1,
    odds: { common: 40, uncommon: 25, rare: 18, epic: 12, legendary: 5 },
  },
};

const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

function rollRarity(odds: Record<Rarity, number>, rng: () => number): Rarity {
  let roll = rng() * 100;
  for (const r of RARITY_ORDER) {
    roll -= odds[r];
    if (roll < 0) return r;
  }
  return 'common';
}

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

export interface PackResult {
  profile: Profile;
  cards: CardId[];
  commanders: CommanderId[];
}

export function openPack(profile: Profile, kind: PackKind, rng: () => number): PackResult {
  const pack = PACKS[kind];
  const p = clone(profile);
  pay(p, pack.cost);
  const cards: CardId[] = [];
  const commanders: CommanderId[] = [];
  for (let i = 0; i < pack.size; i++) {
    const rarity = rollRarity(pack.odds, rng);
    if (kind === 'war') cards.push(pick(CARD_IDS.filter((id) => CARDS[id].rarity === rarity), rng));
    else commanders.push(pick(COMMANDER_IDS.filter((id) => COMMANDERS[id].rarity === rarity), rng));
  }
  return { profile: grant(p, { cards, commanders }), cards, commanders };
}

// ---------- Mercado Negro: transmutación, destilado y mercader ----------

export const ESSENCE_VALUE: Record<Rarity, number> = { common: 5, uncommon: 10, rare: 25, epic: 60, legendary: 150 };
export const CRAFT_COST: Record<Rarity, number> = { common: 20, uncommon: 40, rare: 100, epic: 240, legendary: 600 };

/** Transmuta 3 copias de cartas de una misma rareza en 1 carta aleatoria de la rareza siguiente. */
export function transmute(profile: Profile, input: CardId[], rng: () => number): { profile: Profile; card: CardId } {
  if (input.length !== 3) fail('La transmutación necesita exactamente 3 cartas.');
  const rarity = CARDS[input[0]].rarity;
  if (input.some((id) => CARDS[id].rarity !== rarity)) fail('Las 3 cartas deben ser de la misma rareza.');
  if (rarity === 'legendary') fail('Las legendarias no se pueden transmutar.');
  const p = clone(profile);
  for (const id of input) {
    if ((p.cards[id] ?? 0) <= 0) fail(`No te quedan copias de ${CARDS[id].name}.`);
    p.cards[id]! -= 1;
  }
  const next = RARITY_ORDER[RARITY_ORDER.indexOf(rarity) + 1];
  const card = pick(CARD_IDS.filter((id) => CARDS[id].rarity === next), rng);
  return { profile: grant(p, { cards: [card] }), card };
}

/** Convierte una copia repetida en esencia (siempre conservas al menos una). */
export function distill(profile: Profile, id: CardId): Profile {
  if ((profile.cards[id] ?? 0) < 2) fail('Solo puedes destilar copias repetidas.');
  const p = clone(profile);
  p.cards[id]! -= 1;
  p.resources.essence += ESSENCE_VALUE[CARDS[id].rarity];
  return p;
}

/** Fabrica una carta concreta con esencia. */
export function craft(profile: Profile, id: CardId): Profile {
  const p = clone(profile);
  pay(p, { essence: CRAFT_COST[CARDS[id].rarity] });
  return grant(p, { cards: [id] });
}

export interface MerchantOffer {
  id: string;
  name: string;
  give: Partial<Record<Resource, number>>;
  get: Reward;
}

const OFFER_POOL: MerchantOffer[] = [
  { id: 'iron-tokens', name: 'Fichas por hierro', give: { iron: 15 }, get: { resources: { tokens: 3 } } },
  { id: 'crystal-tokens', name: 'Fichas por cristal', give: { crystal: 10 }, get: { resources: { tokens: 4 } } },
  { id: 'bone-tokens', name: 'Fichas por hueso', give: { bone: 10 }, get: { resources: { tokens: 4 } } },
  { id: 'gold-supplies', name: 'Víveres de contrabando', give: { gold: 60 }, get: { resources: { supplies: 3 } } },
  { id: 'gold-iron', name: 'Lingotes robados', give: { gold: 40 }, get: { resources: { iron: 12 } } },
  { id: 'relic-essence', name: 'Reliquia destilada', give: { bone: 8, crystal: 8 }, get: { resources: { essence: 60 } } },
  { id: 'dark-pact', name: 'Pacto oscuro', give: { gold: 120, bone: 12 }, get: { resources: { tokens: 12 } } },
  { id: 'smuggled-card', name: 'Carta de contrabando', give: { gold: 80, crystal: 6 }, get: { cards: ['chain-lightning'] } },
  { id: 'veteran', name: 'Mercenario veterano', give: { gold: 150, iron: 20, crystal: 10 }, get: { commanders: ['magthar'] } },
  { id: 'lich-phylactery', name: 'Filacteria del Rey Lich', give: { gold: 150, bone: 25 }, get: { commanders: ['morvath'] } },
];

/** Cuatro ofertas del día, iguales para todos los jugadores ese día. */
export function merchantOffers(day: string): MerchantOffer[] {
  const rng = mulberry32(hashString(`merchant:${day}`));
  const pool = [...OFFER_POOL];
  const offers: MerchantOffer[] = [];
  while (offers.length < 4) offers.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return offers;
}

export function buyOffer(profile: Profile, day: string, offerId: string): Profile {
  const offer = merchantOffers(day).find((o) => o.id === offerId) ?? fail('Esa oferta no está disponible hoy.');
  const p = clone(profile);
  if (p.merchant.day !== day) p.merchant = { day, bought: [] };
  if (p.merchant.bought.includes(offerId)) fail('Ya compraste esta oferta hoy.');
  pay(p, offer.give);
  p.merchant.bought.push(offerId);
  return grant(p, offer.get);
}

export function rewardSummary(reward: Reward): string[] {
  const lines: string[] = [];
  for (const [r, n] of Object.entries(reward.resources ?? {})) if (n) lines.push(`${RESOURCES[r as Resource].icon} ${n} ${RESOURCES[r as Resource].name}`);
  for (const c of reward.cards ?? []) lines.push(`🂠 ${CARDS[c].name} (${RARITIES[CARDS[c].rarity].name})`);
  for (const c of reward.commanders ?? []) lines.push(`♛ ${COMMANDERS[c].name} (${RARITIES[COMMANDERS[c].rarity].name})`);
  return lines;
}

// ---------- Azar reproducible ----------

/** Generador pseudoaleatorio con semilla (para pruebas y para el servidor). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
