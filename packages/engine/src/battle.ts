import type { Army, CardPlay } from './army.ts';
import { CARDS, type CardEffect, type CardId, type TargetRule } from './cards.ts';
import { RACES, statsFor, type Race } from './races.ts';
import { BOARD_HEIGHT, BOARD_WIDTH, MAX_TURNS, type UnitStats, type UnitType } from './rules.ts';

// Simulación 100% determinista: sin aleatoriedad ni dependencias de reloj.
// Las mismas entradas producen siempre el mismo resultado, así que cualquiera
// (servidor, jugador, auditor) puede recalcular una partida y verificarla.

export type Side = 0 | 1;
export type StatusEffect = 'stunned' | 'attack' | 'armor' | 'speed';
type BuffStat = 'attack' | 'armor' | 'speed';

export interface UnitState {
  id: number;
  side: Side;
  type: UnitType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Estados activos para el turno siguiente (para dibujarlos). */
  status: StatusEffect[];
}

export type BattleEvent =
  | { kind: 'move'; id: number; path: Array<[number, number]> }
  | { kind: 'attack'; id: number; target: number; damage: number; charge: boolean }
  /** id null = salpicadura de una carta. */
  | { kind: 'splash'; id: number | null; target: number; damage: number }
  /** id null = curación de una carta. */
  | { kind: 'heal'; id: number | null; target: number; amount: number }
  | { kind: 'death'; id: number }
  | { kind: 'rise'; id: number; hp: number }
  | { kind: 'card'; side: Side; card: CardId; fizzled: boolean }
  | { kind: 'spell'; side: Side; card: CardId; target: number; damage: number }
  | { kind: 'buff'; id: number; stat: BuffStat; amount: number; turns: number }
  | { kind: 'stun'; id: number; turns: number }
  | { kind: 'summon'; id: number; side: Side; type: UnitType; x: number; y: number; hp: number }
  | { kind: 'revive'; id: number; x: number; y: number; hp: number };

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
  races: [Race, Race];
  initial: UnitState[];
  frames: Frame[];
}

export interface SimulateOptions {
  /** Si es false no se guardan frames (útil para torneos masivos). */
  record?: boolean;
}

interface Fighter {
  id: number;
  side: Side;
  type: UnitType;
  x: number;
  y: number;
  hp: number;
  stats: UnitStats;
  buffs: Array<{ stat: BuffStat; amount: number; until: number }>;
  stunnedUntil: number;
}

export function simulate(left: Army, right: Army, options: SimulateOptions = {}): BattleResult {
  return new Battle(left, right).run(options.record ?? true);
}

class Battle {
  units: Fighter[] = [];
  races: [Race, Race];
  cards: [CardPlay[], CardPlay[]];
  undyingUsed = [false, false];
  turn = 0;
  events: BattleEvent[] = [];

  constructor(left: Army, right: Army) {
    this.races = [left.race, right.race];
    this.cards = [left.cards ?? [], right.cards ?? []];
    for (const [side, army] of [[0, left], [1, right]] as const) {
      for (const p of army.units) this.spawn(side, p.type, side === 0 ? p.x : BOARD_WIDTH - 1 - p.x, p.y);
    }
  }

  run(record: boolean): BattleResult {
    const initial = this.units.map((u) => this.snapshot(u));
    const frames: Frame[] = [];
    let winner: Side | null = null;
    let reason: BattleResult['reason'] = 'timeout';

    while (this.turn < MAX_TURNS && winner === null) {
      this.turn++;
      this.events = [];
      const first: Side = this.turn % 2 === 1 ? 0 : 1;
      const sides: Side[] = [first, first === 0 ? 1 : 0];

      // Fase de cartas: primero el bando con la iniciativa, en el orden elegido.
      for (const side of sides) {
        for (const play of this.cards[side]) {
          if (play.turn === this.turn && winner === null) {
            this.castCard(side, play.card);
            winner = this.winnerByElimination();
          }
        }
      }
      // Fase de unidades: intercaladas, empezando por el bando con la iniciativa.
      if (winner === null) {
        for (const unit of this.turnOrder(first)) {
          if (unit.hp <= 0 || unit.stunnedUntil >= this.turn) continue;
          this.act(unit);
          winner = this.winnerByElimination();
          if (winner !== null) break;
        }
      }
      if (winner !== null) reason = 'elimination';
      if (record) frames.push({ turn: this.turn, events: this.events, units: this.alive().map((u) => this.snapshot(u)) });
    }

    const score: [number, number] = [this.sideScore(0), this.sideScore(1)];
    if (winner === null && score[0] !== score[1]) winner = score[0] > score[1] ? 0 : 1;
    return { winner, reason, turns: this.turn, score, races: this.races, initial, frames };
  }

  // ---------- Unidades ----------

  private spawn(side: Side, type: UnitType, x: number, y: number): Fighter {
    const stats = statsFor(type, this.races[side]);
    const f: Fighter = { id: this.units.length, side, type, x, y, hp: stats.hp, stats, buffs: [], stunnedUntil: 0 };
    this.units.push(f);
    return f;
  }

  private turnOrder(first: Side): Fighter[] {
    const bySide = [0, 1].map((s) => this.alive().filter((u) => u.side === s));
    const order: Fighter[] = [];
    const longest = Math.max(bySide[0].length, bySide[1].length);
    for (let i = 0; i < longest; i++) {
      for (const side of [first, 1 - first]) {
        const u = bySide[side][i];
        if (u) order.push(u);
      }
    }
    return order;
  }

  private act(unit: Fighter): void {
    if (unit.stats.heal > 0) {
      this.healerAct(unit);
      return;
    }
    const candidates = this.enemiesOf(unit.side)
      .sort((a, b) => distance(unit, a) - distance(unit, b) || a.hp - b.hp || a.id - b.id);
    let target = candidates[0];
    if (!target) return;
    let moved = false;
    if (distance(unit, target) > unit.stats.range) {
      // Avanza hacia el enemigo más cercano que tenga un camino libre.
      for (const candidate of candidates) {
        const path = this.findPath(unit, candidate, unit.stats.range);
        if (!path) continue;
        target = candidate;
        moved = this.moveAlong(unit, path, this.eff(unit, 'speed'));
        break;
      }
    }
    if (distance(unit, target) <= unit.stats.range) this.attack(unit, target, moved);
  }

  private healerAct(unit: Fighter): void {
    const range = unit.stats.range;
    const wounded = this.alliesOf(unit.side)
      .filter((u) => u.id !== unit.id && u.hp < u.stats.hp)
      .sort((a, b) => hpRatioCompare(a, b) || distance(unit, a) - distance(unit, b) || a.id - b.id);
    if (wounded.length === 0) return;

    let target = wounded.find((u) => distance(unit, u) <= range);
    if (!target) {
      const nearest = [...wounded].sort((a, b) => distance(unit, a) - distance(unit, b) || a.id - b.id);
      for (const candidate of nearest) {
        const path = this.findPath(unit, candidate, range);
        if (!path) continue;
        this.moveAlong(unit, path, this.eff(unit, 'speed'));
        if (distance(unit, candidate) <= range) target = candidate;
        break;
      }
    }
    if (target) this.heal(unit.id, target, unit.stats.heal);
  }

  private attack(unit: Fighter, target: Fighter, moved: boolean): void {
    const stats = unit.stats;
    const charge = moved && stats.chargeBonus > 0;
    const raw = this.eff(unit, 'attack') + (charge ? stats.chargeBonus : 0);
    const damage = stats.ignoresArmor ? raw : Math.max(1, raw - this.eff(target, 'armor'));
    target.hp -= damage;
    this.events.push({ kind: 'attack', id: unit.id, target: target.id, damage, charge });
    const hit = [target];
    if (stats.splash > 0) {
      for (const other of this.enemiesOf(unit.side)) {
        if (other.id === target.id || distance(other, target) !== 1) continue;
        other.hp -= stats.splash;
        this.events.push({ kind: 'splash', id: unit.id, target: other.id, damage: stats.splash });
        hit.push(other);
      }
    }
    for (const u of hit) this.checkDeath(u);
  }

  private heal(source: number | null, target: Fighter, amount: number): boolean {
    const healed = Math.min(amount, target.stats.hp - target.hp);
    if (healed <= 0) return false;
    target.hp += healed;
    this.events.push({ kind: 'heal', id: source, target: target.id, amount: healed });
    return true;
  }

  /** Resuelve una unidad con vida ≤ 0: muere o, si su raza es inmortal y aún no se usó, se levanta. */
  private checkDeath(u: Fighter): void {
    if (u.hp > 0) return;
    if (RACES[this.races[u.side]].undying && !this.undyingUsed[u.side]) {
      this.undyingUsed[u.side] = true;
      u.hp = Math.ceil(u.stats.hp / 2);
      u.buffs = [];
      u.stunnedUntil = 0;
      this.events.push({ kind: 'rise', id: u.id, hp: u.hp });
      return;
    }
    this.events.push({ kind: 'death', id: u.id });
  }

  private moveAlong(unit: Fighter, path: Array<[number, number]>, speed: number): boolean {
    const steps = path.slice(0, speed);
    if (steps.length === 0) return false;
    [unit.x, unit.y] = steps[steps.length - 1];
    this.events.push({ kind: 'move', id: unit.id, path: steps });
    return true;
  }

  /**
   * Camino más corto (BFS) hasta una casilla libre desde la que `target` quede a
   * `range` o menos. El orden de vecinos es fijo y relativo al lado de la unidad
   * (adelante, arriba, abajo, atrás), así el resultado es simétrico entre lados.
   */
  private findPath(unit: Fighter, target: Fighter, range: number): Array<[number, number]> | null {
    const blocked = this.occupied(unit.id);
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

  // ---------- Cartas ----------

  private castCard(side: Side, id: CardId): void {
    const event: BattleEvent & { kind: 'card' } = { kind: 'card', side, card: id, fizzled: true };
    this.events.push(event);
    let applied = false;
    for (const effect of CARDS[id].effects) applied = this.applyEffect(side, id, effect) || applied;
    event.fizzled = !applied;
  }

  private applyEffect(side: Side, card: CardId, effect: CardEffect): boolean {
    switch (effect.kind) {
      case 'damage': {
        const target = this.pickTarget(side, effect.target);
        if (!target) return false;
        const hit = [target];
        this.spell(side, card, target, effect.amount, effect.ignoresArmor ?? false);
        if (effect.splash) {
          for (const other of this.enemiesOf(side)) {
            if (other.id === target.id || distance(other, target) !== 1) continue;
            const damage = effect.ignoresArmor ? effect.splash : Math.max(1, effect.splash - this.eff(other, 'armor'));
            other.hp -= damage;
            this.events.push({ kind: 'splash', id: null, target: other.id, damage });
            hit.push(other);
          }
        }
        for (const u of hit) this.checkDeath(u);
        return true;
      }
      case 'chain': {
        const hit: Fighter[] = [];
        for (const amount of effect.amounts) {
          const previous = hit.at(-1);
          const pool = this.enemiesOf(side).filter((u) => !hit.includes(u));
          const next = previous
            ? pool.sort((a, b) => distance(previous, a) - distance(previous, b) || a.id - b.id)[0]
            : this.pickTarget(side, 'frontline');
          if (!next) break;
          hit.push(next);
          this.spell(side, card, next, amount, false);
          this.checkDeath(next);
        }
        return hit.length > 0;
      }
      case 'volley': {
        const targets = this.enemiesOf(side);
        for (const t of targets) this.spell(side, card, t, effect.amount, false);
        for (const t of targets) this.checkDeath(t);
        return targets.length > 0;
      }
      case 'heal': {
        const wounded = this.alliesOf(side).filter((u) => u.hp < u.stats.hp).sort((a, b) => hpRatioCompare(a, b) || a.id - b.id);
        const targets = effect.target === 'all' ? wounded : wounded.slice(0, 1);
        for (const t of targets) this.heal(null, t, effect.amount);
        return targets.length > 0;
      }
      case 'buff': {
        const allies = this.alliesOf(side);
        for (const u of allies) {
          u.buffs.push({ stat: effect.stat, amount: effect.amount, until: this.turn + effect.duration - 1 });
          this.events.push({ kind: 'buff', id: u.id, stat: effect.stat, amount: effect.amount, turns: effect.duration });
        }
        return allies.length > 0;
      }
      case 'stun': {
        const target = this.pickTarget(side, effect.target);
        if (!target) return false;
        target.stunnedUntil = Math.max(target.stunnedUntil, this.turn + effect.duration - 1);
        this.events.push({ kind: 'stun', id: target.id, turns: effect.duration });
        return true;
      }
      case 'summon': {
        const cell = this.summonCell(side);
        if (!cell) return false;
        const u = this.spawn(side, effect.unit, cell[0], cell[1]);
        this.events.push({ kind: 'summon', id: u.id, side, type: u.type, x: u.x, y: u.y, hp: u.hp });
        return true;
      }
      case 'revive': {
        const fallen = this.units.filter((u) => u.side === side && u.hp <= 0)
          .sort((a, b) => (effect.which === 'best' ? b.stats.cost - a.stats.cost : 0) || a.id - b.id);
        let revived = 0;
        for (const u of effect.which === 'best' ? fallen.slice(0, 1) : fallen) {
          const cell = this.freeCellNear(u.x, u.y);
          if (!cell) break;
          [u.x, u.y] = cell;
          u.hp = effect.hp === 'half' ? Math.ceil(u.stats.hp / 2) : Math.min(effect.hp, u.stats.hp);
          u.buffs = [];
          u.stunnedUntil = 0;
          this.events.push({ kind: 'revive', id: u.id, x: u.x, y: u.y, hp: u.hp });
          revived++;
        }
        return revived > 0;
      }
    }
  }

  private spell(side: Side, card: CardId, target: Fighter, amount: number, ignoresArmor: boolean): void {
    const damage = ignoresArmor ? amount : Math.max(1, amount - this.eff(target, 'armor'));
    target.hp -= damage;
    this.events.push({ kind: 'spell', side, card, target: target.id, damage });
  }

  private pickTarget(side: Side, rule: TargetRule): Fighter | undefined {
    const enemies = this.enemiesOf(side);
    const adjacent = (u: Fighter) => enemies.filter((o) => o !== u && distance(o, u) === 1).length;
    // "Más adelantado" = más cerca del lado de quien lanza la carta.
    const advance = (u: Fighter) => (side === 0 ? u.x : BOARD_WIDTH - 1 - u.x);
    const order: Record<TargetRule, (a: Fighter, b: Fighter) => number> = {
      weakest: (a, b) => a.hp - b.hp || a.id - b.id,
      strongest: (a, b) => b.hp - a.hp || a.id - b.id,
      frontline: (a, b) => advance(a) - advance(b) || a.hp - b.hp || a.id - b.id,
      cluster: (a, b) => adjacent(b) - adjacent(a) || b.hp - a.hp || a.id - b.id,
    };
    return enemies.sort(order[rule])[0];
  }

  /** Primera casilla libre desde la retaguardia propia, empezando por el centro. */
  private summonCell(side: Side): [number, number] | null {
    const blocked = this.occupied();
    for (let col = 0; col < BOARD_WIDTH; col++) {
      const x = side === 0 ? col : BOARD_WIDTH - 1 - col;
      for (const y of centerOut()) if (!blocked.has(y * BOARD_WIDTH + x)) return [x, y];
    }
    return null;
  }

  private freeCellNear(x: number, y: number): [number, number] | null {
    const blocked = this.occupied();
    const cells: Array<[number, number]> = [];
    for (let cy = 0; cy < BOARD_HEIGHT; cy++) for (let cx = 0; cx < BOARD_WIDTH; cx++) cells.push([cx, cy]);
    const free = cells.filter(([cx, cy]) => !blocked.has(cy * BOARD_WIDTH + cx));
    free.sort((a, b) => distance({ x, y }, { x: a[0], y: a[1] }) - distance({ x, y }, { x: b[0], y: b[1] }) || a[1] - b[1] || a[0] - b[0]);
    return free[0] ?? null;
  }

  // ---------- Utilidades ----------

  private eff(u: Fighter, stat: BuffStat): number {
    return u.stats[stat] + u.buffs.reduce((sum, b) => sum + (b.stat === stat && b.until >= this.turn ? b.amount : 0), 0);
  }

  private alive(): Fighter[] {
    return this.units.filter((u) => u.hp > 0);
  }

  private enemiesOf(side: Side): Fighter[] {
    return this.alive().filter((u) => u.side !== side);
  }

  private alliesOf(side: Side): Fighter[] {
    return this.alive().filter((u) => u.side === side);
  }

  private occupied(except = -1): Set<number> {
    return new Set(this.alive().filter((u) => u.id !== except).map((u) => u.y * BOARD_WIDTH + u.x));
  }

  private winnerByElimination(): Side | null {
    for (const side of [0, 1] as const) {
      if (this.alliesOf(side).length === 0) return side === 0 ? 1 : 0;
    }
    return null;
  }

  private snapshot(u: Fighter): UnitState {
    const next = this.turn + 1;
    const status: StatusEffect[] = [];
    if (u.stunnedUntil >= next) status.push('stunned');
    for (const stat of ['attack', 'armor', 'speed'] as const) {
      if (u.buffs.some((b) => b.stat === stat && b.until >= next)) status.push(stat);
    }
    return { id: u.id, side: u.side, type: u.type, x: u.x, y: u.y, hp: u.hp, maxHp: u.stats.hp, status };
  }

  private sideScore(side: Side): number {
    return this.alliesOf(side).reduce((sum, u) => sum + Math.floor((u.stats.cost * 1000 * u.hp) / u.stats.hp), 0);
  }
}

function centerOut(): number[] {
  const mid = Math.floor((BOARD_HEIGHT - 1) / 2);
  const order = [mid];
  for (let d = 1; order.length < BOARD_HEIGHT; d++) {
    if (mid + d < BOARD_HEIGHT) order.push(mid + d);
    if (mid - d >= 0) order.push(mid - d);
  }
  return order;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function hpRatioCompare(a: Fighter, b: Fighter): number {
  return a.hp * b.stats.hp - b.hp * a.stats.hp;
}
