import type { BossId } from './bosses.ts';
import { CARDS, isCardId, type CardId } from './cards.ts';
import { COMMANDERS, isCommanderId, type CommanderId } from './commanders.ts';
import { isArmorId, type ArmorId } from './cosmetics.ts';
import { isRace, type Race } from './races.ts';
import {
  BOARD_HEIGHT, BUDGET, CARD_TURN_MAX, DEPLOY_COLUMNS, ENERGY, MAX_CARDS, MAX_LEGENDARY_CARDS, MAX_UNITS, UNITS,
  isDraftable, type UnitType,
} from './rules.ts';

/**
 * Posición de despliegue en coordenadas propias: x = 0 es la retaguardia y
 * x = DEPLOY_COLUMNS - 1 la primera línea. El motor refleja al lado derecho.
 */
export interface Placement {
  type: UnitType;
  x: number;
  y: number;
}

/** Carta programada: se ejecuta al empezar el turno indicado. */
export interface CardPlay {
  card: CardId;
  turn: number;
}

/** Posición del comandante, en la misma zona de despliegue que las unidades. */
export interface CommanderPlacement {
  id: CommanderId;
  x: number;
  y: number;
}

export interface Army {
  race: Race;
  /** Obligatorio en ejércitos de jugadores (validateArmy lo exige). */
  commander?: CommanderPlacement;
  units: Placement[];
  cards?: CardPlay[];
  /** Cosmético: no afecta a la simulación. */
  armor?: ArmorId;
}

/** Ejército de la campaña: puede incluir jefes de incursión. */
export interface BattleArmy extends Army {
  bosses?: Array<{ id: BossId; x: number; y: number }>;
}

export type ValidationResult = { ok: true; army: Army; cost: number; energy: number } | { ok: false; error: string };

/** Valida datos no confiables (p. ej. un body HTTP) y devuelve un ejército normalizado. */
export function validateArmy(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null || !Array.isArray((input as Army).units)) {
    return { ok: false, error: 'El ejército debe tener una lista "units".' };
  }
  const { race, armor } = input as Army;
  if (!isRace(race)) return { ok: false, error: 'Elige una raza válida.' };
  if (armor !== undefined && !isArmorId(armor)) return { ok: false, error: 'Armadura desconocida.' };

  const raw = (input as Army).units;
  if (raw.length === 0) return { ok: false, error: 'Despliega al menos una unidad.' };
  if (raw.length > MAX_UNITS) return { ok: false, error: `Máximo ${MAX_UNITS} unidades.` };

  const units: Placement[] = [];
  const occupied = new Set<string>();
  let cost = 0;
  for (const [i, u] of raw.entries()) {
    if (typeof u !== 'object' || u === null) return { ok: false, error: `Unidad ${i} inválida.` };
    const { type, x, y } = u as Placement;
    if (!isDraftable(type)) return { ok: false, error: `Unidad ${i}: tipo desconocido.` };
    if (!Number.isInteger(x) || x < 0 || x >= DEPLOY_COLUMNS || !Number.isInteger(y) || y < 0 || y >= BOARD_HEIGHT) {
      return { ok: false, error: `Unidad ${i}: fuera de tu zona de despliegue.` };
    }
    const key = `${x},${y}`;
    if (occupied.has(key)) return { ok: false, error: `Unidad ${i}: casilla ocupada.` };
    occupied.add(key);
    cost += UNITS[type].cost;
    units.push({ type, x, y });
  }
  if (cost > BUDGET) return { ok: false, error: `Coste ${cost} supera el presupuesto de ${BUDGET}.` };

  const rawCommander = (input as Army).commander;
  if (typeof rawCommander !== 'object' || rawCommander === null) return { ok: false, error: 'Tu ejército necesita un comandante.' };
  const { id: commanderId, x: cx, y: cy } = rawCommander;
  if (!isCommanderId(commanderId)) return { ok: false, error: 'Comandante desconocido.' };
  if (COMMANDERS[commanderId].race !== race) return { ok: false, error: `${COMMANDERS[commanderId].name} no pertenece a esta raza.` };
  if (!Number.isInteger(cx) || cx < 0 || cx >= DEPLOY_COLUMNS || !Number.isInteger(cy) || cy < 0 || cy >= BOARD_HEIGHT) {
    return { ok: false, error: 'Coloca a tu comandante en tu zona de despliegue.' };
  }
  if (occupied.has(`${cx},${cy}`)) return { ok: false, error: 'El comandante no puede compartir casilla.' };

  const rawCards = (input as Army).cards ?? [];
  if (!Array.isArray(rawCards)) return { ok: false, error: '"cards" debe ser una lista.' };
  if (rawCards.length > MAX_CARDS) return { ok: false, error: `Máximo ${MAX_CARDS} cartas.` };
  const cards: CardPlay[] = [];
  let energy = 0;
  let legendaries = 0;
  for (const [i, c] of rawCards.entries()) {
    if (typeof c !== 'object' || c === null) return { ok: false, error: `Carta ${i} inválida.` };
    const { card, turn } = c as CardPlay;
    if (!isCardId(card)) return { ok: false, error: `Carta ${i}: desconocida.` };
    const def = CARDS[card];
    if (def.race !== null && def.race !== race) return { ok: false, error: `${def.name} es exclusiva de otra raza.` };
    if (cards.some((p) => p.card === card)) return { ok: false, error: `${def.name} está repetida.` };
    if (!Number.isInteger(turn) || turn < 1 || turn > CARD_TURN_MAX) {
      return { ok: false, error: `${def.name}: el turno debe estar entre 1 y ${CARD_TURN_MAX}.` };
    }
    if (def.rarity === 'legendary') legendaries++;
    energy += def.cost;
    cards.push({ card, turn });
  }
  if (legendaries > MAX_LEGENDARY_CARDS) return { ok: false, error: `Máximo ${MAX_LEGENDARY_CARDS} carta legendaria.` };
  if (energy > ENERGY) return { ok: false, error: `Las cartas cuestan ${energy} de energía; el máximo es ${ENERGY}.` };

  const army: Army = { race, commander: { id: commanderId, x: cx, y: cy }, units, cards };
  if (armor !== undefined) army.armor = armor;
  return { ok: true, army, cost, energy };
}

export function armyCost(army: Pick<Army, 'units'>): number {
  return army.units.reduce((sum, u) => sum + UNITS[u.type].cost, 0);
}

export function cardEnergy(army: Pick<Army, 'cards'>): number {
  return (army.cards ?? []).reduce((sum, c) => sum + CARDS[c.card].cost, 0);
}

/**
 * Serialización canónica (orden estable) para calcular compromisos/hashes:
 * dos ejércitos equivalentes producen exactamente el mismo texto.
 */
export function canonicalArmy(army: Army): string {
  const units = [...army.units].sort((a, b) => a.x - b.x || a.y - b.y || a.type.localeCompare(b.type));
  const cards = [...(army.cards ?? [])].sort((a, b) => a.card.localeCompare(b.card));
  return [
    `race=${army.race}`,
    `commander=${army.commander ? `${army.commander.id}@${army.commander.x},${army.commander.y}` : ''}`,
    `armor=${army.armor ?? ''}`,
    `units=${units.map((u) => `${u.type}@${u.x},${u.y}`).join(';')}`,
    `cards=${cards.map((c) => `${c.card}@${c.turn}`).join(';')}`,
  ].join('|');
}
