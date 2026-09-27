import type { BattleArmy, CardPlay } from './army.ts';
import { BOSSES, BOSS_VALUE, type BossId } from './bosses.ts';
import { CARDS, type CardEffect, type CardId, type TargetRule } from './cards.ts';
import { COMMANDERS, COMMANDER_VALUE, type CommanderId } from './commanders.ts';
import { RACES, statsFor, type Race, type StatMods } from './races.ts';
import { BOARD_HEIGHT, BOARD_WIDTH, MAX_TURNS, UNITS, type UnitStats, type UnitType } from './rules.ts';

// Simulación 100% determinista: sin aleatoriedad ni dependencias de reloj.
// Las mismas entradas producen siempre el mismo resultado, así que cualquiera
// (servidor, jugador, auditor) puede recalcular una partida y verificarla.

export type Side = 0 | 1;
export type StatusEffect = 'stunned' | 'attack' | 'armor' | 'speed' | 'thorns' | 'weakened' | 'poison' | 'shield' | 'broken';
type BuffStat = 'attack' | 'armor' | 'speed' | 'thorns';

/** Unidad especial: comandante o jefe. */
export type Special = { kind: 'commander'; id: CommanderId } | { kind: 'boss'; id: BossId };

export interface UnitState {
  id: number;
  side: Side;
  type: UnitType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  shield: number;
  /** Estados activos para el turno siguiente (para dibujarlos). */
  status: StatusEffect[];
  special?: Special;
}

export type BattleEvent =
  | { kind: 'move'; id: number; path: Array<[number, number]> }
  | { kind: 'attack'; id: number; target: number; damage: number; charge: boolean; absorbed?: number }
  /** id null = salpicadura de una carta o habilidad. */
  | { kind: 'splash'; id: number | null; target: number; damage: number; absorbed?: number }
  /** id null = curación de una carta o habilidad. */
  | { kind: 'heal'; id: number | null; target: number; amount: number }
  | { kind: 'death'; id: number }
  | { kind: 'rise'; id: number; hp: number }
  | { kind: 'card'; side: Side; card: CardId; fizzled: boolean }
  /** Habilidad de comandante o ataque especial de un jefe. */
  | { kind: 'ability'; side: Side; id: number; name: string; fizzled: boolean }
  /** card null = daño de una habilidad (no de una carta). */
  | { kind: 'spell'; side: Side; card: CardId | null; target: number; damage: number; absorbed?: number }
  | { kind: 'buff'; id: number; stat: BuffStat; amount: number; turns: number }
  | { kind: 'shield'; id: number; amount: number }
  | { kind: 'poison'; id: number; damage: number }
  | { kind: 'poisoned'; id: number; amount: number; turns: number }
  | { kind: 'thorns'; id: number; target: number; damage: number }
  | { kind: 'stun'; id: number; turns: number }
  /** El comandante de `side` ha caído: sus tropas pierden 1 de ataque. */
  | { kind: 'morale'; side: Side }
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
  /** Daño total recibido por los jefes (incursiones). */
  bossDamage: number;
  /** Vida total inicial de los jefes (0 si no hay). */
  bossHp: number;
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
  shield: number;
  poison: { amount: number; until: number } | null;
  special?: Special;
  abilityFired: boolean;
  /** Ya se emitió su muerte (evita duplicarla). */
  dead: boolean;
}

export function simulate(left: BattleArmy, right: BattleArmy, options: SimulateOptions = {}): BattleResult {
  return new Battle(left, right).run(options.record ?? true);
}

type Source = CardId | null;

class Battle {
  units: Fighter[] = [];
  races: [Race, Race];
  cards: [CardPlay[], CardPlay[]];
  passiveMods: [Partial<Record<UnitType, StatMods>>, Partial<Record<UnitType, StatMods>>] = [{}, {}];
  undyingUsed = [false, false];
  allyFell = [false, false];
  turn = 0;
  events: BattleEvent[] = [];
  bossHp = 0;

  constructor(left: BattleArmy, right: BattleArmy) {
    this.races = [left.race, right.race];
    this.cards = [left.cards ?? [], right.cards ?? []];
    for (const [side, army] of [[0, left], [1, right]] as const) {
      const mirror = (x: number) => (side === 0 ? x : BOARD_WIDTH - 1 - x);
      if (army.commander) {
        const def = COMMANDERS[army.commander.id];
        this.passiveMods[side] = def.passive.mods;
        const stats: UnitStats = {
          ...UNITS.commander, ...def.stats, name: def.name, cost: COMMANDER_VALUE, description: def.title,
        };
        this.add(side, 'commander', mirror(army.commander.x), army.commander.y, stats, { kind: 'commander', id: def.id });
      }
      for (const p of army.units) this.spawn(side, p.type, mirror(p.x), p.y);
      for (const b of army.bosses ?? []) {
        const def = BOSSES[b.id];
        const stats: UnitStats = {
          ...UNITS.boss, ...def.stats, chargeBonus: 0, heal: 0, name: def.name, cost: BOSS_VALUE, description: def.title,
        };
        this.add(side, 'boss', mirror(b.x), b.y, stats, { kind: 'boss', id: def.id });
        this.bossHp += stats.hp;
      }
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

      // 1. Veneno. 2. Habilidades de inicio de turno. 3. Cartas. 4. Unidades.
      this.tickPoison();
      winner = this.winnerByElimination();
      if (winner === null) {
        for (const side of sides) this.turnStartAbilities(side);
        this.checkTriggers(sides);
        winner = this.winnerByElimination();
      }
      for (const side of sides) {
        for (const play of this.cards[side]) {
          if (play.turn === this.turn && winner === null) {
            this.castCard(side, play.card);
            this.checkTriggers(sides);
            winner = this.winnerByElimination();
          }
        }
      }
      if (winner === null) {
        for (const unit of this.turnOrder(first)) {
          if (unit.hp <= 0 || unit.stunnedUntil >= this.turn) continue;
          this.act(unit);
          this.checkTriggers(sides);
          winner = this.winnerByElimination();
          if (winner !== null) break;
        }
      }
      if (winner !== null) reason = 'elimination';
      if (record) frames.push({ turn: this.turn, events: this.events, units: this.alive().map((u) => this.snapshot(u)) });
    }

    const score: [number, number] = [this.sideScore(0), this.sideScore(1)];
    if (winner === null && score[0] !== score[1]) winner = score[0] > score[1] ? 0 : 1;
    const bossDamage = this.units.filter((u) => u.special?.kind === 'boss')
      .reduce((sum, u) => sum + (u.stats.hp - Math.max(0, u.hp)), 0);
    return { winner, reason, turns: this.turn, score, races: this.races, bossDamage, bossHp: this.bossHp, initial, frames };
  }

  // ---------- Unidades ----------

  private add(side: Side, type: UnitType, x: number, y: number, stats: UnitStats, special?: Special): Fighter {
    const f: Fighter = {
      id: this.units.length, side, type, x, y, hp: stats.hp, stats, buffs: [], stunnedUntil: 0, shield: 0, poison: null,
      abilityFired: false, dead: false,
    };
    if (special) f.special = special;
    this.units.push(f);
    return f;
  }

  private spawn(side: Side, type: UnitType, x: number, y: number): Fighter {
    return this.add(side, type, x, y, statsFor(type, this.races[side], this.passiveMods[side][type] ?? {}));
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
    const amount = stats.ignoresArmor ? Math.max(1, raw) : Math.max(1, raw - this.eff(target, 'armor'));
    const { damage, absorbed } = this.hurt(target, amount);
    this.events.push({ kind: 'attack', id: unit.id, target: target.id, damage, charge, ...(absorbed ? { absorbed } : {}) });
    const hit = [target];
    if (stats.splash > 0) {
      for (const other of this.enemiesOf(unit.side)) {
        if (other.id === target.id || distance(other, target) !== 1) continue;
        const r = this.hurt(other, stats.splash);
        this.events.push({ kind: 'splash', id: unit.id, target: other.id, damage: r.damage, ...(r.absorbed ? { absorbed: r.absorbed } : {}) });
        hit.push(other);
      }
    }
    // Espinas: quien golpea cuerpo a cuerpo recibe daño de vuelta.
    const thorns = this.eff(target, 'thorns');
    if (thorns > 0 && distance(unit, target) === 1) {
      const r = this.hurt(unit, thorns);
      this.events.push({ kind: 'thorns', id: target.id, target: unit.id, damage: r.damage });
      hit.push(unit);
    }
    for (const u of hit) this.checkDeath(u);
  }

  /** Aplica daño: primero lo absorbe el escudo y el resto va a la vida. */
  private hurt(u: Fighter, amount: number): { damage: number; absorbed: number } {
    const absorbed = Math.min(u.shield, amount);
    u.shield -= absorbed;
    u.hp -= amount - absorbed;
    return { damage: amount - absorbed, absorbed };
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
    if (u.hp > 0 || u.dead) return;
    if (RACES[this.races[u.side]].undying && !this.undyingUsed[u.side] && u.special?.kind !== 'boss') {
      this.undyingUsed[u.side] = true;
      u.hp = Math.ceil(u.stats.hp / 2);
      u.buffs = u.buffs.filter((b) => b.until === Infinity);
      u.stunnedUntil = 0;
      u.poison = null;
      this.events.push({ kind: 'rise', id: u.id, hp: u.hp });
      return;
    }
    u.dead = true;
    this.events.push({ kind: 'death', id: u.id });
    if (u.special?.kind === 'commander') {
      // Moral rota: el resto del ejército pierde 1 de ataque hasta el final.
      this.events.push({ kind: 'morale', side: u.side });
      for (const ally of this.alliesOf(u.side)) ally.buffs.push({ stat: 'attack', amount: -1, until: Infinity });
    } else {
      this.allyFell[u.side] = true;
    }
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

  // ---------- Veneno, habilidades y cartas ----------

  private tickPoison(): void {
    const poisoned = this.alive().filter((u) => u.poison && u.poison.until >= this.turn);
    for (const u of poisoned) {
      u.hp -= u.poison!.amount;
      this.events.push({ kind: 'poison', id: u.id, damage: u.poison!.amount });
    }
    for (const u of poisoned) this.checkDeath(u);
  }

  private turnStartAbilities(side: Side): void {
    for (const u of this.alliesOf(side)) {
      if (u.special?.kind === 'commander' && !u.abilityFired) {
        const trigger = COMMANDERS[u.special.id].ability.trigger;
        if ((trigger === 'start' && this.turn === 1) || (typeof trigger === 'object' && trigger.turn === this.turn)) this.fireAbility(u);
      }
      if (u.special?.kind === 'boss') {
        const special = BOSSES[u.special.id].special;
        if (this.turn % special.every === 0) this.useAbility(u, special.name, special.effects);
      }
    }
  }

  /** Disparadores que dependen de lo ocurrido: vida del comandante y primera baja. */
  private checkTriggers(sides: Side[]): void {
    for (let round = 0; round < 4; round++) {
      let fired = false;
      for (const side of sides) {
        const c = this.alliesOf(side).find((u) => u.special?.kind === 'commander' && !u.abilityFired);
        if (!c || c.special?.kind !== 'commander') continue;
        const trigger = COMMANDERS[c.special.id].ability.trigger;
        if ((trigger === 'hp50' && c.hp * 2 <= c.stats.hp) || (trigger === 'firstDeath' && this.allyFell[side])) {
          this.fireAbility(c);
          fired = true;
        }
      }
      if (!fired) return;
    }
  }

  private fireAbility(u: Fighter): void {
    if (u.special?.kind !== 'commander') return;
    u.abilityFired = true;
    const ability = COMMANDERS[u.special.id].ability;
    this.useAbility(u, ability.name, ability.effects);
  }

  private useAbility(u: Fighter, name: string, effects: CardEffect[]): void {
    const event: BattleEvent & { kind: 'ability' } = { kind: 'ability', side: u.side, id: u.id, name, fizzled: true };
    this.events.push(event);
    let applied = false;
    for (const effect of effects) applied = this.applyEffect(u.side, null, effect) || applied;
    event.fizzled = !applied;
  }

  private castCard(side: Side, id: CardId): void {
    const event: BattleEvent & { kind: 'card' } = { kind: 'card', side, card: id, fizzled: true };
    this.events.push(event);
    let applied = false;
    for (const effect of CARDS[id].effects) applied = this.applyEffect(side, id, effect) || applied;
    event.fizzled = !applied;
  }

  private applyEffect(side: Side, source: Source, effect: CardEffect): boolean {
    switch (effect.kind) {
      case 'damage': {
        const target = this.pickTarget(side, effect.target);
        if (!target) return false;
        const hit = [target];
        this.spell(side, source, target, effect.amount, effect.ignoresArmor ?? false);
        if (effect.splash) {
          for (const other of this.enemiesOf(side)) {
            if (other.id === target.id || distance(other, target) !== 1) continue;
            const amount = effect.ignoresArmor ? effect.splash : Math.max(1, effect.splash - this.eff(other, 'armor'));
            const r = this.hurt(other, amount);
            this.events.push({ kind: 'splash', id: null, target: other.id, damage: r.damage, ...(r.absorbed ? { absorbed: r.absorbed } : {}) });
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
          this.spell(side, source, next, amount, false);
          this.checkDeath(next);
        }
        return hit.length > 0;
      }
      case 'volley': {
        const targets = this.enemiesOf(side);
        for (const t of targets) this.spell(side, source, t, effect.amount, false);
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
        const targets = effect.enemies ? this.enemiesOf(side) : this.alliesOf(side);
        for (const u of targets) {
          u.buffs.push({ stat: effect.stat, amount: effect.amount, until: this.turn + effect.duration - 1 });
          this.events.push({ kind: 'buff', id: u.id, stat: effect.stat, amount: effect.amount, turns: effect.duration });
        }
        return targets.length > 0;
      }
      case 'shield': {
        const allies = this.alliesOf(side).sort((a, b) => hpRatioCompare(a, b) || a.id - b.id);
        const targets = effect.target === 'all' ? allies : allies.slice(0, 1);
        for (const u of targets) {
          u.shield += effect.amount;
          this.events.push({ kind: 'shield', id: u.id, amount: effect.amount });
        }
        return targets.length > 0;
      }
      case 'poison': {
        const center = this.pickTarget(side, effect.target);
        if (!center) return false;
        const targets = effect.spread
          ? this.enemiesOf(side).filter((u) => u === center || distance(u, center) === 1)
          : [center];
        for (const u of targets) {
          u.poison = { amount: effect.amount, until: this.turn + effect.duration };
          this.events.push({ kind: 'poisoned', id: u.id, amount: effect.amount, turns: effect.duration });
        }
        return true;
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
        const fallen = this.units.filter((u) => u.side === side && u.hp <= 0 && !u.special)
          .sort((a, b) => (effect.which === 'best' ? b.stats.cost - a.stats.cost : 0) || a.id - b.id);
        let revived = 0;
        for (const u of effect.which === 'best' ? fallen.slice(0, 1) : fallen) {
          const cell = this.freeCellNear(u.x, u.y);
          if (!cell) break;
          [u.x, u.y] = cell;
          u.hp = effect.hp === 'half' ? Math.ceil(u.stats.hp / 2) : Math.min(effect.hp, u.stats.hp);
          u.buffs = u.buffs.filter((b) => b.until === Infinity);
          u.stunnedUntil = 0;
          u.shield = 0;
          u.poison = null;
          u.dead = false;
          this.events.push({ kind: 'revive', id: u.id, x: u.x, y: u.y, hp: u.hp });
          revived++;
        }
        return revived > 0;
      }
    }
  }

  private spell(side: Side, card: Source, target: Fighter, amount: number, ignoresArmor: boolean): void {
    const raw = ignoresArmor ? amount : Math.max(1, amount - this.eff(target, 'armor'));
    const { damage, absorbed } = this.hurt(target, raw);
    this.events.push({ kind: 'spell', side, card, target: target.id, damage, ...(absorbed ? { absorbed } : {}) });
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

  private net(u: Fighter, stat: BuffStat): number {
    return u.buffs.reduce((sum, b) => sum + (b.stat === stat && b.until >= this.turn ? b.amount : 0), 0);
  }

  private eff(u: Fighter, stat: BuffStat): number {
    const base = stat === 'thorns' ? 0 : u.stats[stat];
    return Math.max(stat === 'speed' ? 1 : 0, base + this.net(u, stat));
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
    const netAt = (stat: BuffStat) => u.buffs.reduce((s, b) => s + (b.stat === stat && b.until >= next && b.until !== Infinity ? b.amount : 0), 0);
    if (u.stunnedUntil >= next) status.push('stunned');
    let weakened = false;
    for (const stat of ['attack', 'armor', 'speed'] as const) {
      const n = netAt(stat);
      if (n > 0) status.push(stat);
      if (n < 0) weakened = true;
    }
    if (weakened) status.push('weakened');
    if (netAt('thorns') > 0) status.push('thorns');
    if (u.poison && u.poison.until >= next) status.push('poison');
    if (u.shield > 0) status.push('shield');
    if (u.buffs.some((b) => b.until === Infinity)) status.push('broken');
    const state: UnitState = { id: u.id, side: u.side, type: u.type, x: u.x, y: u.y, hp: u.hp, maxHp: u.stats.hp, shield: u.shield, status };
    if (u.special) state.special = u.special;
    return state;
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
