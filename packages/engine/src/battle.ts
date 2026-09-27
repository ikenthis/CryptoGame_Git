import type { Army } from './army.ts';
import { BOARD_HEIGHT, BOARD_WIDTH, MAX_TURNS, UNITS, type UnitType } from './rules.ts';

// Simulación 100% determinista: sin aleatoriedad ni dependencias de reloj.
// Las mismas entradas producen siempre el mismo resultado, así que cualquiera
// (servidor, jugador, auditor) puede recalcular una partida y verificarla.

export type Side = 0 | 1;

export interface UnitState {
  id: number;
  side: Side;
  type: UnitType;
  x: number;
  y: number;
  hp: number;
}

export type BattleEvent =
  | { kind: 'move'; id: number; path: Array<[number, number]> }
  | { kind: 'attack'; id: number; target: number; damage: number; charge: boolean }
  | { kind: 'splash'; id: number; target: number; damage: number }
  | { kind: 'heal'; id: number; target: number; amount: number }
  | { kind: 'death'; id: number };

export interface Frame {
  turn: number;
  events: BattleEvent[];
  units: UnitState[];
}

export interface BattleResult {
  winner: Side | null;
  reason: 'elimination' | 'timeout';
  turns: number;
  /** Valor restante de cada lado (coste ponderado por vida, ×1000). */
  score: [number, number];
  initial: UnitState[];
  frames: Frame[];
}

export interface SimulateOptions {
  /** Si es false no se guardan frames (útil para torneos masivos). */
  record?: boolean;
}

export function simulate(left: Army, right: Army, options: SimulateOptions = {}): BattleResult {
  const record = options.record ?? true;
  const units: UnitState[] = [];
  for (const [side, army] of [[0, left], [1, right]] as const) {
    for (const p of army.units) {
      units.push({
        id: units.length,
        side,
        type: p.type,
        x: side === 0 ? p.x : BOARD_WIDTH - 1 - p.x,
        y: p.y,
        hp: UNITS[p.type].hp,
      });
    }
  }
  const initial = units.map((u) => ({ ...u }));
  const frames: Frame[] = [];

  let turn = 0;
  let winner: Side | null = null;
  let reason: BattleResult['reason'] = 'timeout';

  while (turn < MAX_TURNS && winner === null) {
    turn++;
    const events: BattleEvent[] = [];
    for (const unit of turnOrder(units, turn)) {
      if (unit.hp <= 0) continue;
      act(unit, units, events);
      const eliminated = eliminatedSide(units);
      if (eliminated !== null) {
        winner = eliminated === 0 ? 1 : 0;
        reason = 'elimination';
        break;
      }
    }
    if (record) frames.push({ turn, events, units: alive(units).map((u) => ({ ...u })) });
  }

  const score: [number, number] = [sideScore(units, 0), sideScore(units, 1)];
  if (winner === null && score[0] !== score[1]) winner = score[0] > score[1] ? 0 : 1;
  return { winner, reason, turns: turn, score, initial, frames };
}

/** Intercala unidades de ambos lados; quién empieza alterna cada turno. */
function turnOrder(units: UnitState[], turn: number): UnitState[] {
  const bySide = [alive(units).filter((u) => u.side === 0), alive(units).filter((u) => u.side === 1)];
  const first = turn % 2 === 1 ? 0 : 1;
  const order: UnitState[] = [];
  const longest = Math.max(bySide[0].length, bySide[1].length);
  for (let i = 0; i < longest; i++) {
    for (const side of [first, 1 - first]) {
      const u = bySide[side][i];
      if (u) order.push(u);
    }
  }
  return order;
}

function act(unit: UnitState, units: UnitState[], events: BattleEvent[]): void {
  const stats = UNITS[unit.type];
  if (stats.heal > 0) {
    healerAct(unit, units, events);
    return;
  }

  const enemies = alive(units).filter((u) => u.side !== unit.side);
  const candidates = [...enemies].sort((a, b) => distance(unit, a) - distance(unit, b) || a.hp - b.hp || a.id - b.id);
  let target = candidates[0];
  let moved = false;
  if (distance(unit, target) > stats.range) {
    // Avanza hacia el enemigo más cercano que tenga un camino libre.
    for (const candidate of candidates) {
      const path = findPath(unit, candidate, stats.range, units);
      if (!path) continue;
      target = candidate;
      moved = moveAlong(unit, path, stats.speed, events);
      break;
    }
  }
  if (distance(unit, target) <= stats.range) attack(unit, target, moved, units, events);
}

function healerAct(unit: UnitState, units: UnitState[], events: BattleEvent[]): void {
  const stats = UNITS[unit.type];
  const wounded = alive(units)
    .filter((u) => u.side === unit.side && u.id !== unit.id && u.hp < UNITS[u.type].hp)
    .sort((a, b) => hpRatioCompare(a, b) || distance(unit, a) - distance(unit, b) || a.id - b.id);
  if (wounded.length === 0) return;

  let target = wounded.find((u) => distance(unit, u) <= stats.range);
  if (!target) {
    const nearest = [...wounded].sort((a, b) => distance(unit, a) - distance(unit, b) || a.id - b.id);
    for (const candidate of nearest) {
      const path = findPath(unit, candidate, stats.range, units);
      if (!path) continue;
      moveAlong(unit, path, stats.speed, events);
      if (distance(unit, candidate) <= stats.range) target = candidate;
      break;
    }
  }
  if (!target) return;
  const amount = Math.min(stats.heal, UNITS[target.type].hp - target.hp);
  target.hp += amount;
  events.push({ kind: 'heal', id: unit.id, target: target.id, amount });
}

function attack(unit: UnitState, target: UnitState, moved: boolean, units: UnitState[], events: BattleEvent[]): void {
  const stats = UNITS[unit.type];
  const charge = moved && stats.chargeBonus > 0;
  const raw = stats.attack + (charge ? stats.chargeBonus : 0);
  const damage = stats.ignoresArmor ? raw : Math.max(1, raw - UNITS[target.type].armor);
  target.hp -= damage;
  events.push({ kind: 'attack', id: unit.id, target: target.id, damage, charge });

  if (stats.splash > 0) {
    for (const other of alive(units)) {
      if (other.side === unit.side || other.id === target.id || distance(other, target) !== 1) continue;
      other.hp -= stats.splash;
      events.push({ kind: 'splash', id: unit.id, target: other.id, damage: stats.splash });
      if (other.hp <= 0) events.push({ kind: 'death', id: other.id });
    }
  }
  if (target.hp <= 0) events.push({ kind: 'death', id: target.id });
}

function moveAlong(unit: UnitState, path: Array<[number, number]>, speed: number, events: BattleEvent[]): boolean {
  const steps = path.slice(0, speed);
  if (steps.length === 0) return false;
  const [x, y] = steps[steps.length - 1];
  unit.x = x;
  unit.y = y;
  events.push({ kind: 'move', id: unit.id, path: steps });
  return true;
}

/**
 * Camino más corto (BFS) hasta una casilla libre desde la que `target` quede a
 * `range` o menos. El orden de vecinos es fijo y relativo al lado de la unidad
 * (adelante, arriba, abajo, atrás), así el resultado es simétrico entre lados.
 */
function findPath(unit: UnitState, target: UnitState, range: number, units: UnitState[]): Array<[number, number]> | null {
  const blocked = new Set(alive(units).filter((u) => u.id !== unit.id).map((u) => u.y * BOARD_WIDTH + u.x));
  const forward = unit.side === 0 ? 1 : -1;
  const dirs: Array<[number, number]> = [[forward, 0], [0, -1], [0, 1], [-forward, 0]];
  const start = unit.y * BOARD_WIDTH + unit.x;
  const previous = new Map<number, number>([[start, -1]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    const x = cell % BOARD_WIDTH;
    const y = Math.floor(cell / BOARD_WIDTH);
    if (cell !== start && Math.abs(x - target.x) + Math.abs(y - target.y) <= range) {
      const path: Array<[number, number]> = [];
      for (let c = cell; c !== start; c = previous.get(c)!) path.unshift([c % BOARD_WIDTH, Math.floor(c / BOARD_WIDTH)]);
      return path;
    }
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= BOARD_WIDTH || ny < 0 || ny >= BOARD_HEIGHT) continue;
      const next = ny * BOARD_WIDTH + nx;
      if (previous.has(next) || blocked.has(next)) continue;
      previous.set(next, cell);
      queue.push(next);
    }
  }
  return null;
}

function alive(units: UnitState[]): UnitState[] {
  return units.filter((u) => u.hp > 0);
}

function eliminatedSide(units: UnitState[]): Side | null {
  for (const side of [0, 1] as const) {
    if (!units.some((u) => u.side === side && u.hp > 0)) return side;
  }
  return null;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function hpRatioCompare(a: UnitState, b: UnitState): number {
  return a.hp * UNITS[b.type].hp - b.hp * UNITS[a.type].hp;
}

function sideScore(units: UnitState[], side: Side): number {
  return alive(units)
    .filter((u) => u.side === side)
    .reduce((sum, u) => sum + Math.floor((UNITS[u.type].cost * 1000 * u.hp) / UNITS[u.type].hp), 0);
}
