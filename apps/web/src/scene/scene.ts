import {
  BOARD_HEIGHT, BOARD_WIDTH, BOSSES, CARDS, COMMANDERS, DEPLOY_COLUMNS, UNITS,
  type ArmorId, type BattleArmy, type BattleEvent, type BattleResult, type CardId, type CommanderPlacement, type Placement,
  type Race, type Side, type Special, type StatusEffect, type UnitState, type UnitType,
} from '@gentium/engine';
import type { Sfx } from '../audio/sound.ts';
import { spriteFor } from '../art/sprites.ts';
import { ARMOR_ART, RACE_ART, RARITY_COLORS, STATUS_COLORS, TEAM_COLORS } from '../art/theme.ts';

// Escenario del tablero: dibuja el campo, las unidades y reproduce una batalla
// del motor como una línea de tiempo de animaciones. No decide nada del juego:
// solo interpreta los eventos que devolvió simulate().

export const CELL = 84;
const PAD = 28;
export const VIEW_W = BOARD_WIDTH * CELL + PAD * 2;
export const VIEW_H = BOARD_HEIGHT * CELL + PAD * 2;

export interface Look {
  race: Race;
  armor: ArmorId;
}

/** Ejército a mostrar en el modo edición. */
export interface BuildArmy {
  units: Placement[];
  commander?: CommanderPlacement | null;
  bosses?: BattleArmy['bosses'];
  look: Look;
}

export interface SceneHooks {
  /** Presentación del enfrentamiento antes del primer turno. */
  onIntro?: () => void;
  /** Habilidad de comandante o ataque especial de jefe. */
  onAbility?: (side: Side, caster: Special | undefined, name: string, fizzled: boolean) => void;
  onAbilityEnd?: () => void;
  /** Ha caído el comandante de `side`. */
  onMorale?: (side: Side) => void;
  onTurn?: (turn: number) => void;
  onCard?: (side: Side, card: CardId, fizzled: boolean) => void;
  onCardEnd?: () => void;
  onFinish?: () => void;
  onSfx?: (name: Sfx, intensity?: number) => void;
}

interface DUnit {
  id: number;
  side: Side;
  type: UnitType;
  look: Look;
  x: number;
  y: number;
  hp: number;
  hpShown: number;
  maxHp: number;
  alpha: number;
  flash: number;
  offX: number;
  offY: number;
  scale: number;
  status: StatusEffect[];
  phase: number;
  shield: number;
  special?: Special;
}

interface Anim {
  start: number;
  duration: number;
  started?: boolean;
  ended?: boolean;
  onStart?: () => void;
  onUpdate?: (p: number) => void;
  onEnd?: () => void;
  draw?: (c: CanvasRenderingContext2D, p: number) => void;
  /** Golpe final: cámara lenta y zoom sobre `focus`. */
  slow?: { focus: () => { x: number; y: number } };
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string;
  gravity: number; additive: boolean; drag: number;
}

interface Floater { text: string; x: number; y: number; color: string; life: number; size: number }

interface Spec {
  duration: number;
  /** Fracción de la duración que bloquea el siguiente evento. */
  block?: number;
  concurrent?: boolean;
  onStart?: () => void;
  onUpdate?: (p: number) => void;
  onEnd?: () => void;
  draw?: (c: CanvasRenderingContext2D, p: number) => void;
}

/** Contexto compartido entre los eventos de un turno. */
interface TurnCtx {
  chainFrom: { x: number; y: number } | null;
  caster: number | null;
}

const px = (x: number) => PAD + x * CELL + CELL / 2;
const py = (y: number) => PAD + y * CELL + CELL / 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - (1 - t) * (1 - t);
const STAT_LABEL = { attack: 'ATQ', armor: 'ARM', speed: 'VEL', thorns: 'ESPINAS' } as const;
const INTRO_MS = 1700;

/** Escala de dibujo según el tipo de unidad. */
function sizeOf(u: { type: UnitType }): number {
  return u.type === 'boss' ? 1.9 : u.type === 'golem' ? 1.25 : u.type === 'commander' ? 1.14 : 1;
}

/** Alcance real (los comandantes y jefes tienen el suyo). */
function rangeOf(u: { type: UnitType; special?: Special }): number {
  if (u.special?.kind === 'commander') return COMMANDERS[u.special.id].stats.range;
  if (u.special?.kind === 'boss') return BOSSES[u.special.id].stats.range;
  return UNITS[u.type].range;
}

/** Tipo visual para elegir proyectiles y sonidos. */
function visualType(u: { type: UnitType; special?: Special } | undefined): UnitType | 'dragon' | 'colossus' {
  if (!u) return 'warrior';
  if (u.special?.kind === 'commander') return COMMANDERS[u.special.id].archetype;
  if (u.special?.kind === 'boss') return BOSSES[u.special.id].look;
  return u.type;
}

export class Scene {
  readonly canvas: HTMLCanvasElement;
  private readonly c: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement | null = null;
  private units = new Map<number, DUnit>();
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private anims: Anim[] = [];
  private looks: [Look, Look] = [{ race: 'human', armor: 'iron' }, { race: 'orc', armor: 'iron' }];
  private mySide: Side = 0;
  private time = 0;
  private endTime = 0;
  private last = 0;
  private clock = 0;
  private shake = 0;
  private flash = { alpha: 0, color: '#fff' };
  private cam = { zoom: 1, x: VIEW_W / 2, y: VIEW_H / 2 };
  private introAt = -1;
  mode: 'build' | 'battle' = 'build';
  playing = false;
  speed = 1;
  hover: { x: number; y: number } | null = null;
  ghost: { type: UnitType; look: Look; special?: Special } | null = null;
  hooks: SceneHooks = {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.c = canvas.getContext('2d')!;
    this.resize();
    requestAnimationFrame((t) => this.loop(t));
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = VIEW_W * dpr;
    this.canvas.height = VIEW_H * dpr;
    this.c.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.bg = renderBoard(dpr);
  }

  cellAt(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const lx = ((clientX - rect.left) / rect.width) * VIEW_W;
    const ly = ((clientY - rect.top) / rect.height) * VIEW_H;
    const x = Math.floor((lx - PAD) / CELL);
    const y = Math.floor((ly - PAD) / CELL);
    return x >= 0 && x < BOARD_WIDTH && y >= 0 && y < BOARD_HEIGHT ? { x, y } : null;
  }

  // ---------- Modo edición ----------

  setBuild(mine: BuildArmy, enemy?: BuildArmy): void {
    this.mode = 'build';
    this.playing = false;
    this.anims = [];
    this.mySide = 0;
    this.cam = { zoom: 1, x: VIEW_W / 2, y: VIEW_H / 2 };
    this.looks = [mine.look, enemy?.look ?? mine.look];
    const next = new Map<number, DUnit>();
    const add = (side: Side, id: number, type: UnitType, px0: number, y: number, maxHp: number, special?: Special) => {
      const x = side === 0 ? px0 : BOARD_WIDTH - 1 - px0;
      const same = (u: DUnit) => u.side === side && u.x === x && u.y === y && u.type === type && u.special?.id === special?.id;
      const prev = [...this.units.values()].find(same);
      const unit = prev ?? this.newUnit({ id, side, type, x, y, hp: maxHp, maxHp, shield: 0, status: [], ...(special ? { special } : {}) });
      next.set(id, { ...unit, id, look: this.looks[side], alpha: side === 0 ? 1 : 0.85 });
      if (!prev) this.sparkle(next.get(id)!);
    };
    for (const [side, army, base] of [[0, mine, 0], [1, enemy, 100]] as const) {
      if (!army) continue;
      army.units.forEach((p, i) => add(side, base + i, p.type, p.x, p.y, UNITS[p.type].hp));
      if (army.commander) {
        const def = COMMANDERS[army.commander.id];
        add(side, base + 50, 'commander', army.commander.x, army.commander.y, def.stats.hp, { kind: 'commander', id: def.id });
      }
      (army.bosses ?? []).forEach((b, i) => add(side, base + 60 + i, 'boss', b.x, b.y, BOSSES[b.id].stats.hp, { kind: 'boss', id: b.id }));
    }
    this.units = next;
  }

  // ---------- Batalla ----------

  play(result: BattleResult, looks: [Look, Look], mySide: Side): void {
    this.mode = 'battle';
    this.looks = looks;
    this.mySide = mySide;
    this.units = new Map(result.initial.map((u) => [u.id, this.newUnit(u)]));
    this.deadCache = new Map(this.units);
    this.particles = [];
    this.floaters = [];
    this.anims = [];
    this.cam = { zoom: 1, x: VIEW_W / 2, y: VIEW_H / 2 };
    // Presentación: los ejércitos entran desde los flancos y aparece el «VS».
    this.anims.push({
      start: 0, duration: INTRO_MS - 200,
      onStart: () => { this.introAt = 0; this.hooks.onIntro?.(); this.sfx('legendary', 0.5); },
      onUpdate: (p) => {
        const k = 1 - ease(Math.min(1, p * 1.4));
        for (const u of this.units.values()) {
          u.offX = (u.side === 0 ? -1 : 1) * k * CELL * 4;
          u.alpha = 1 - k * 0.8;
        }
      },
      onEnd: () => {
        for (const u of this.units.values()) { u.offX = 0; u.alpha = 1; }
        this.shake = 10;
        this.sfx('heavy', 0.8);
      },
    });
    // El último golpe de la batalla se ve a cámara lenta.
    const lastFrame = result.frames.at(-1);
    const finalDeath = result.reason === 'elimination' ? lastFrame?.events.filter((e) => e.kind === 'death').at(-1) : undefined;
    let t = INTRO_MS;
    for (const frame of result.frames) {
      this.anims.push({ start: t, duration: 0, onStart: () => this.hooks.onTurn?.(frame.turn) });
      let lastStart = t;
      let lastDuration = 0;
      let prev: BattleEvent | null = null;
      const ctx: TurnCtx = { chainFrom: null, caster: null };
      for (const ev of frame.events) {
        if (ev.kind === 'card') { ctx.chainFrom = null; ctx.caster = null; }
        if (ev.kind === 'ability') { ctx.chainFrom = null; ctx.caster = ev.id; }
        const spec = this.specFor(ev, prev, lastDuration, ctx);
        const start = spec.concurrent ? lastStart : t;
        const anim: Anim = { start, duration: spec.duration, onStart: spec.onStart, onUpdate: spec.onUpdate, onEnd: spec.onEnd, draw: spec.draw };
        if (ev === finalDeath) anim.slow = { focus: () => this.pos(ev.id) };
        this.anims.push(anim);
        t = Math.max(t, start + spec.duration * (spec.block ?? 1));
        if (!spec.concurrent) {
          lastStart = start;
          lastDuration = spec.duration;
        }
        prev = ev;
      }
      t += 140;
      const snapshot = frame.units;
      this.anims.push({ start: t, duration: 0, onStart: () => this.sync(snapshot) });
    }
    t += 400;
    this.anims.push({ start: t, duration: 0, onStart: () => { this.playing = false; this.hooks.onFinish?.(); } });
    this.endTime = t;
    this.time = 0;
    this.playing = true;
  }

  skip(): void {
    if (!this.playing) return;
    this.time = this.endTime;
    this.runAnims();
    this.particles = [];
    this.floaters = [];
  }

  private specFor(ev: BattleEvent, prev: BattleEvent | null, prevDuration: number, ctx: TurnCtx): Spec {
    switch (ev.kind) {
      case 'move': {
        let from: Array<[number, number]> = [];
        return {
          duration: 120 * ev.path.length,
          // Los desplazamientos se solapan con la siguiente acción para dar ritmo.
          block: 0.6,
          onStart: () => {
            const u = this.units.get(ev.id);
            if (!u) return;
            from = [[u.x, u.y], ...ev.path];
            this.dust(px(u.x), py(u.y) + CELL * 0.3);
          },
          onUpdate: (p) => {
            const u = this.units.get(ev.id);
            if (!u || from.length < 2) return;
            const seg = Math.min(from.length - 2, Math.floor(p * (from.length - 1)));
            const t = p * (from.length - 1) - seg;
            u.x = lerp(from[seg][0], from[seg + 1][0], t);
            u.y = lerp(from[seg][1], from[seg + 1][1], t);
          },
          onEnd: () => {
            const u = this.units.get(ev.id);
            if (u) [u.x, u.y] = ev.path[ev.path.length - 1];
          },
        };
      }
      case 'attack': {
        const attacker = this.peek(ev.id);
        const type = visualType(attacker);
        const ranged = attacker ? rangeOf(attacker) > 1 : false;
        const magic = type === 'mage' || type === 'dragon' || type === 'colossus';
        const duration = ranged ? (magic ? 340 : 300) : ev.charge ? 340 : 260;
        let hitDone = false;
        let a = { x: 0, y: 0 };
        let b = { x: 0, y: 0 };
        const impact = () => {
          if (hitDone) return;
          hitDone = true;
          const color = type === 'dragon' ? '#ff7a1a' : magic ? RACE_ART[this.lookOf(ev.id).race].magic : '#ffffff';
          this.hit(ev.target, ev.damage, color, ev.charge || attacker?.type === 'boss' ? 'charge' : 'normal', ev.absorbed);
          this.sfx(ev.charge ? 'heavy' : 'hit', ev.damage / 4);
          if (ev.charge) {
            this.shake = Math.max(this.shake, 9);
            this.floatText('¡CARGA!', b.x, b.y - CELL * 0.8, '#ffd24a', 20);
          }
        };
        return {
          duration,
          onStart: () => {
            a = this.pos(ev.id);
            b = this.pos(ev.target);
            this.sfx(type === 'archer' ? 'arrow' : type === 'dragon' ? 'fireball' : magic ? 'magic' : 'swing');
          },
          onUpdate: (p) => {
            const u = this.units.get(ev.id);
            if (!ranged && u) {
              const k = Math.sin(Math.min(1, p) * Math.PI) * CELL * (ev.charge ? 0.45 : 0.3);
              const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
              u.offX = ((b.x - a.x) / d) * k;
              u.offY = ((b.y - a.y) / d) * k;
              if (p >= 0.5) impact();
            }
          },
          onEnd: () => {
            const u = this.units.get(ev.id);
            if (u) u.offX = u.offY = 0;
            impact();
          },
          draw: ranged ? (c, p) => {
            const x = lerp(a.x, b.x, p);
            const y = lerp(a.y, b.y, p) - Math.sin(p * Math.PI) * (type === 'archer' ? CELL * 0.5 : CELL * 0.15) - CELL * 0.25;
            if (type === 'archer') drawArrow(c, x, y, Math.atan2(b.y - a.y, b.x - a.x) + (0.5 - p) * -1.2 * Math.sign(b.x - a.x || 1), '#e8e2d0');
            else this.orbProjectile(c, x, y, type === 'dragon' ? '#ff7a1a' : RACE_ART[this.lookOf(ev.id).race].magic, type === 'dragon' ? 13 : 8);
          } : undefined,
        };
      }
      case 'splash': {
        const concurrent = prev?.kind === 'attack' || prev?.kind === 'spell' || prev?.kind === 'splash';
        return {
          duration: concurrent ? prevDuration : 250,
          concurrent,
          onEnd: () => {
            this.hit(ev.target, ev.damage, '#c792ea', 'normal', ev.absorbed);
            this.sfx('hit', 0.5);
          },
        };
      }
      case 'heal': {
        const fromCard = ev.id === null;
        let a = { x: 0, y: 0 };
        let b = { x: 0, y: 0 };
        return {
          duration: fromCard ? 520 : 320,
          concurrent: fromCard && prev?.kind === 'heal' && prev.id === null,
          onStart: () => {
            b = this.pos(ev.target);
            a = ev.id === null ? b : this.pos(ev.id);
            this.sfx('heal');
          },
          onEnd: () => {
            const u = this.units.get(ev.target);
            if (u) u.hp = Math.min(u.maxHp, u.hp + ev.amount);
            this.floatText(`+${ev.amount}`, b.x, b.y - CELL * 0.55, '#6dff9e', 18);
            this.burst(b.x, b.y, '#9dffc0', 14, 1.2, 3, -0.03, 700);
          },
          draw: (c, p) => {
            c.save();
            c.globalCompositeOperation = 'lighter';
            if (fromCard) {
              const g = c.createLinearGradient(0, b.y - CELL * 1.6, 0, b.y + CELL * 0.3);
              g.addColorStop(0, 'rgba(255,240,160,0)');
              g.addColorStop(0.7, `rgba(180,255,190,${0.55 * Math.sin(p * Math.PI)})`);
              g.addColorStop(1, 'rgba(180,255,190,0)');
              c.fillStyle = g;
              c.fillRect(b.x - CELL * 0.32, b.y - CELL * 1.6, CELL * 0.64, CELL * 1.9);
            } else {
              c.strokeStyle = 'rgba(140,255,180,0.8)';
              c.lineWidth = 4 * Math.sin(p * Math.PI) + 1;
              c.shadowColor = '#6dff9e';
              c.shadowBlur = 14;
              c.beginPath();
              c.moveTo(a.x + CELL * 0.2, a.y - CELL * 0.55);
              c.quadraticCurveTo((a.x + b.x) / 2, Math.min(a.y, b.y) - CELL * 0.8, lerp(a.x, b.x, p), lerp(a.y, b.y, p) - CELL * 0.2);
              c.stroke();
            }
            c.restore();
          },
        };
      }
      case 'death':
        return {
          duration: 520,
          block: 0.35,
          onStart: () => {
            const u = this.units.get(ev.id);
            if (!u) return;
            const { x, y } = this.pos(ev.id);
            this.sfx('death');
            const col = ARMOR_ART[u.look.armor].glow ?? RACE_ART[u.look.race].cloth;
            this.burst(x, y, col, 26, 2.6, 3.5, 0.06, 800);
            this.burst(x, y - CELL * 0.2, '#ffffff', 8, 0.8, 5, -0.05, 1200);
          },
          onUpdate: (p) => {
            const u = this.units.get(ev.id);
            if (u) {
              u.alpha = 1 - p;
              u.offY = p * CELL * 0.15;
            }
          },
          onEnd: () => this.units.delete(ev.id),
        };
      case 'rise': {
        return {
          duration: 900,
          onStart: () => {
            const { x, y } = this.pos(ev.id);
            this.sfx('rise');
            this.smoke(x, y, '#4b2a73', 30);
            this.burst(x, y, '#5ff5d6', 22, 1.6, 3, -0.04, 1000);
          },
          onUpdate: (p) => {
            const u = this.units.get(ev.id);
            if (u) {
              u.alpha = 0.3 + 0.7 * p;
              u.flash = 1 - p;
            }
          },
          onEnd: () => {
            const u = this.units.get(ev.id);
            if (!u) return;
            u.hp = ev.hp;
            u.alpha = 1;
            const { x, y } = this.pos(ev.id);
            this.floatText('¡SE LEVANTA!', x, y - CELL * 0.8, '#5ff5d6', 18);
          },
        };
      }
      case 'card': {
        const def = CARDS[ev.card];
        const legendary = def.rarity === 'legendary';
        return {
          duration: legendary ? 1650 : 1150,
          onStart: () => {
            this.hooks.onCard?.(ev.side, ev.card, ev.fizzled);
            this.sfx(legendary ? 'legendary' : 'card');
            const col = RARITY_COLORS[def.rarity].main;
            const x = ev.side === 0 ? PAD + CELL : VIEW_W - PAD - CELL;
            this.burst(x, VIEW_H / 2, col, legendary ? 70 : 30, legendary ? 5 : 3, 4, 0, 1200);
            if (legendary) {
              this.flash = { alpha: 0.75, color: RARITY_COLORS.legendary.light };
              this.shake = 12;
            }
          },
          onEnd: () => {
            this.hooks.onCardEnd?.();
            if (ev.fizzled) this.floatText('Sin efecto', VIEW_W / 2, VIEW_H / 2, '#b8c0c8', 22);
          },
        };
      }
      case 'spell':
        return this.spellSpec(ev, prev, ctx);
      case 'ability': {
        const caster = this.peek(ev.id);
        const boss = caster?.special?.kind === 'boss';
        return {
          duration: boss ? 1300 : 1500,
          onStart: () => {
            this.hooks.onAbility?.(ev.side, caster?.special, ev.name, ev.fizzled);
            this.sfx(boss ? 'explosion' : 'legendary', boss ? 0.7 : 0.8);
            const { x, y } = this.pos(ev.id);
            const color = boss ? '#ff7a1a' : RACE_ART[this.looks[ev.side].race].magic;
            this.burst(x, y, color, 60, 4.5, 4, -0.02, 1300);
            this.flash = { alpha: 0.45, color };
            this.shake = Math.max(this.shake, boss ? 16 : 8);
            this.cam = { zoom: 1.08, x, y };
          },
          onEnd: () => {
            this.hooks.onAbilityEnd?.();
            if (ev.fizzled) this.floatText('Sin efecto', VIEW_W / 2, VIEW_H / 2, '#b8c0c8', 22);
          },
          draw: (c, p) => {
            const { x, y } = this.pos(ev.id);
            const color = boss ? '#ff7a1a' : RACE_ART[this.looks[ev.side].race].magic;
            ringPulse(c, x, y + CELL * 0.3, CELL * (0.4 + p * 1.6), color, 1 - p);
            ringPulse(c, x, y + CELL * 0.3, CELL * (0.2 + p * 0.9), '#ffffff', (1 - p) * 0.7);
            lightPillar(c, x, y, color, Math.sin(p * Math.PI) * 0.8);
          },
        };
      }
      case 'shield':
        return {
          duration: 520,
          concurrent: prev?.kind === 'shield',
          onStart: () => {
            const u = this.units.get(ev.id);
            if (u) {
              u.shield += ev.amount;
              if (!u.status.includes('shield')) u.status.push('shield');
            }
            this.sfx('buff');
            const { x, y } = this.pos(ev.id);
            this.burst(x, y, '#8fd3ff', 14, 1.4, 3, -0.03, 800);
            this.floatText(`+${ev.amount} 🛡`, x, y - CELL * 0.75, '#8fd3ff', 15);
          },
          draw: (c, p) => {
            const { x, y } = this.pos(ev.id);
            bubble(c, x, y - CELL * 0.25, CELL * 0.5 * ease(Math.min(1, p * 2)), '#8fd3ff', 1 - p * 0.5);
          },
        };
      case 'poisoned':
        return {
          duration: 600,
          concurrent: prev?.kind === 'poisoned' || prev?.kind === 'card' || prev?.kind === 'ability',
          onStart: () => {
            const u = this.units.get(ev.id);
            if (u && !u.status.includes('poison')) u.status.push('poison');
            this.sfx('magic', 0.5);
            const { x, y } = this.pos(ev.id);
            this.smoke(x, y, '#3f8f2a', 10);
            this.burst(x, y, '#8fdf4a', 18, 1.6, 3, -0.02, 900);
          },
        };
      case 'poison':
        return {
          duration: 420,
          concurrent: prev?.kind === 'poison',
          onStart: () => {
            const u = this.units.get(ev.id);
            const { x, y } = this.pos(ev.id);
            if (u) { u.hp -= ev.damage; u.flash = 0.6; }
            this.burst(x, y - CELL * 0.1, '#8fdf4a', 12, 1.2, 3, -0.04, 700);
            this.floatText(`-${ev.damage} ☠`, x, y - CELL * 0.6, '#9dff6a', 17);
            this.sfx('hit', 0.3);
          },
        };
      case 'thorns':
        return {
          duration: prevDuration || 260,
          concurrent: prev?.kind === 'attack',
          onEnd: () => {
            const { x, y } = this.pos(ev.target);
            this.hit(ev.target, ev.damage, '#6dff9e', 'normal');
            this.burst(x, y, '#3fbf6a', 16, 2.4, 2.5, 0.04, 600);
            this.floatText('¡ESPINAS!', x, y - CELL * 0.9, '#6dff9e', 14);
          },
        };
      case 'morale':
        return {
          duration: 1200,
          onStart: () => {
            this.hooks.onMorale?.(ev.side);
            this.sfx('defeat', 0.6);
            this.flash = { alpha: 0.4, color: '#5a0a0a' };
            this.shake = 12;
            for (const u of this.units.values()) if (u.side === ev.side && !u.status.includes('broken')) u.status.push('broken');
          },
          onEnd: () => this.hooks.onAbilityEnd?.(),
        };
      case 'buff': {
        const debuff = ev.amount < 0;
        const color = debuff ? '#c792ea' : STATUS_COLORS[ev.stat];
        return {
          duration: 650,
          concurrent: prev?.kind === 'buff',
          onStart: () => {
            const u = this.units.get(ev.id);
            const status: StatusEffect = debuff ? 'weakened' : ev.stat;
            if (u && !u.status.includes(status)) u.status.push(status);
            this.sfx(debuff ? 'magic' : 'buff', debuff ? 0.5 : 1);
            const { x, y } = this.pos(ev.id);
            this.burst(x, y + CELL * 0.2, color, 16, 1.4, 3, debuff ? 0.06 : -0.06, 900);
            this.floatText(`${debuff ? '' : '+'}${ev.amount} ${STAT_LABEL[ev.stat]}`, x, y - CELL * 0.75, color, 15);
          },
          draw: (c, p) => {
            const { x, y } = this.pos(ev.id);
            ringPulse(c, x, y + CELL * 0.3, CELL * (0.3 + p * 0.5), color, 1 - p);
          },
        };
      }
      case 'stun':
        return {
          duration: 600,
          onStart: () => {
            const u = this.units.get(ev.id);
            if (u && !u.status.includes('stunned')) u.status.push('stunned');
            this.sfx('freeze');
            const { x, y } = this.pos(ev.id);
            this.burst(x, y, STATUS_COLORS.stunned, 30, 2.4, 3.5, 0.02, 900);
            this.floatText('¡CONGELADO!', x, y - CELL * 0.8, STATUS_COLORS.stunned, 17);
          },
          draw: (c, p) => {
            const { x, y } = this.pos(ev.id);
            ringPulse(c, x, y, CELL * (0.2 + p * 0.6), '#e8f8ff', 1 - p);
          },
        };
      case 'summon':
      case 'revive': {
        const summon = ev.kind === 'summon';
        const color = summon ? RACE_ART[this.looks[ev.kind === 'summon' ? ev.side : 0].race].magic : '#ffe28a';
        let spawned = false;
        const appear = () => {
          if (spawned) return;
          spawned = true;
          const side: Side = ev.kind === 'summon' ? ev.side : (this.peekDead(ev.id)?.side ?? 0);
          const type: UnitType = ev.kind === 'summon' ? ev.type : (this.peekDead(ev.id)?.type ?? 'warrior');
          const maxHp = this.deadCache.get(ev.id)?.maxHp ?? UNITS[type].hp;
          const u = this.newUnit({ id: ev.id, side, type, x: ev.x, y: ev.y, hp: ev.hp, maxHp: summon ? ev.hp : maxHp, shield: 0, status: [] });
          u.scale = 0.2;
          this.units.set(ev.id, u);
          this.sfx(summon ? 'summon' : 'rise');
          this.burst(px(ev.x), py(ev.y), color, 40, 3, 4, -0.02, 1000);
          this.shake = Math.max(this.shake, summon ? 8 : 4);
          this.floatText(summon ? '¡INVOCACIÓN!' : '¡REVIVE!', px(ev.x), py(ev.y) - CELL * 0.85, color, 18);
        };
        return {
          duration: 1000,
          onUpdate: (p) => {
            if (p >= 0.55) appear();
            const u = this.units.get(ev.id);
            if (spawned && u) u.scale = Math.min(1, ease((p - 0.55) / 0.35));
          },
          onEnd: () => {
            appear();
            const u = this.units.get(ev.id);
            if (u) u.scale = 1;
          },
          draw: (c, p) => {
            const x = px(ev.x);
            const y = py(ev.y);
            if (summon) portal(c, x, y + CELL * 0.28, CELL * 0.48 * Math.min(1, p * 2), color, this.clock, Math.sin(p * Math.PI));
            else lightPillar(c, x, y, color, Math.sin(p * Math.PI));
          },
        };
      }
    }
  }

  private spellSpec(ev: BattleEvent & { kind: 'spell' }, prev: BattleEvent | null, ctx: TurnCtx): Spec {
    const caster = ctx.caster !== null ? this.peek(ctx.caster) : undefined;
    const bossFire = caster?.special?.kind === 'boss' && BOSSES[caster.special.id].look === 'dragon';
    // Las habilidades se ven como meteoros (fuego de dragón) o como magia de la raza.
    const card: CardId | 'ability' = ev.card ?? (bossFire ? 'meteor' : 'ability');
    const concurrent = prev?.kind === 'spell' && prev.card === ev.card && card !== 'chain-lightning';
    const casterX = ev.side === 0 ? PAD - 10 : VIEW_W - PAD + 10;
    let a = { x: 0, y: 0 };
    let b = { x: 0, y: 0 };
    const getChain = () => ctx.chainFrom;
    const setChain = (p: { x: number; y: number }) => { ctx.chainFrom = p; };
    const impact = (color: string, big = false) => {
      this.hit(ev.target, ev.damage, color, big ? 'charge' : 'normal', ev.absorbed);
      this.sfx(big ? 'explosion' : 'hit', ev.damage / 4);
      if (big) this.shake = Math.max(this.shake, 14);
    };
    if (card === 'meteor') {
      return {
        duration: 620, concurrent,
        onStart: () => {
          b = this.pos(ev.target);
          a = { x: b.x + (ev.side === 0 ? -1 : 1) * CELL * 2.2, y: -CELL };
          this.sfx('fireball');
        },
        onEnd: () => {
          impact('#ffb347', true);
          this.burst(b.x, b.y, '#ff7a1a', 60, 5, 5, 0.08, 1100);
          this.burst(b.x, b.y, '#ffe27a', 30, 3, 3, 0.02, 700);
          this.smoke(b.x, b.y, '#2a1a12', 18);
          this.flash = { alpha: 0.35, color: '#ffb347' };
        },
        draw: (c, p) => {
          const t = p * p;
          const x = lerp(a.x, b.x, t);
          const y = lerp(a.y, b.y, t);
          c.save();
          c.globalCompositeOperation = 'lighter';
          const g = c.createLinearGradient(a.x, a.y, x, y);
          g.addColorStop(0, 'rgba(255,90,20,0)');
          g.addColorStop(1, 'rgba(255,170,60,0.9)');
          c.strokeStyle = g;
          c.lineWidth = 16;
          c.beginPath(); c.moveTo(lerp(a.x, x, 0.5), lerp(a.y, y, 0.5)); c.lineTo(x, y); c.stroke();
          c.restore();
          this.orbProjectile(c, x, y, '#ff7a1a', 16);
          if (Math.random() < 0.8) this.particles.push(particle(x, y, (Math.random() - 0.5) * 2, -Math.random(), '#ffb347', 5, 500, -0.02, true));
        },
      };
    }
    if (card === 'chain-lightning') {
      return {
        duration: 260,
        onStart: () => {
          b = this.pos(ev.target);
          a = getChain() ?? { x: casterX, y: b.y };
          setChain(b);
          this.sfx('lightning');
          this.flash = { alpha: 0.25, color: '#d9c2ff' };
        },
        onEnd: () => impact('#e2c2ff'),
        draw: (c, p) => lightning(c, a.x, a.y - CELL * 0.2, b.x, b.y - CELL * 0.2, 1 - p * 0.6),
      };
    }
    if (card === 'sylvaran-storm') {
      return {
        duration: 700, concurrent,
        onStart: () => {
          b = this.pos(ev.target);
          this.sfx('arrow');
        },
        onEnd: () => {
          impact('#b6f5c9');
          this.burst(b.x, b.y, '#7dffb5', 16, 2.2, 3, 0.05, 700);
        },
        draw: (c, p) => {
          for (let i = 0; i < 4; i++) {
            const q = Math.max(0, Math.min(1, p * 1.4 - i * 0.12));
            if (q <= 0 || q >= 1) continue;
            const ox = (i - 1.5) * 12;
            drawArrow(c, b.x + ox - (1 - q) * CELL * 0.8, b.y - (1 - q) * CELL * 3 - CELL * 0.1, Math.PI / 2 - 0.25, '#d9f5b0');
          }
        },
      };
    }
    const fire = card === 'fire-arrow';
    const color = fire ? '#ff7a1a' : card === 'ability' ? RACE_ART[this.looks[ev.side].race].magic : RARITY_COLORS[CARDS[card].rarity].main;
    return {
      duration: 420, concurrent,
      onStart: () => {
        b = this.pos(ev.target);
        a = caster ? this.pos(caster.id) : { x: casterX, y: b.y - CELL * 0.6 };
        this.sfx(fire ? 'fireball' : 'magic', 0.6);
      },
      onEnd: () => {
        impact(color);
        this.burst(b.x, b.y, color, 24, 2.6, 3.5, 0.03, 700);
      },
      draw: (c, p) => {
        const x = lerp(a.x, b.x, p);
        const y = lerp(a.y, b.y - CELL * 0.2, p);
        if (fire) {
          drawArrow(c, x, y, Math.atan2(b.y - a.y, b.x - a.x), '#ffd27a');
          this.particles.push(particle(x, y, 0, -0.3, '#ff7a1a', 4, 350, -0.01, true));
        } else this.orbProjectile(c, x, y, color);
      },
    };
  }

  // ---------- Estado de unidades ----------

  private deadCache = new Map<number, DUnit>();

  private newUnit(u: UnitState): DUnit {
    return {
      id: u.id, side: u.side, type: u.type, look: this.looks[u.side], x: u.x, y: u.y, hp: u.hp, hpShown: u.hp, maxHp: u.maxHp,
      alpha: 1, flash: 0, offX: 0, offY: 0, scale: 1, status: [...u.status], phase: (u.id * 1.7) % (Math.PI * 2),
      shield: u.shield ?? 0, ...(u.special ? { special: u.special } : {}),
    };
  }

  private peek(id: number): DUnit | undefined {
    return this.units.get(id) ?? this.deadCache.get(id);
  }

  private peekDead(id: number): DUnit | undefined {
    return this.deadCache.get(id) ?? this.units.get(id);
  }

  private lookOf(id: number): Look {
    return this.peek(id)?.look ?? this.looks[0];
  }

  private pos(id: number): { x: number; y: number } {
    const u = this.peek(id);
    return u ? { x: px(u.x), y: py(u.y) } : { x: VIEW_W / 2, y: VIEW_H / 2 };
  }

  /** Alinea el estado dibujado con la foto autoritativa del motor al final de cada turno. */
  private sync(snapshot: UnitState[]): void {
    const seen = new Set<number>();
    for (const s of snapshot) {
      seen.add(s.id);
      const u = this.units.get(s.id) ?? this.newUnit(s);
      Object.assign(u, { x: s.x, y: s.y, hp: s.hp, maxHp: s.maxHp, shield: s.shield, status: [...s.status], alpha: 1, scale: 1, offX: 0, offY: 0 });
      this.units.set(s.id, u);
    }
    for (const id of [...this.units.keys()]) if (!seen.has(id)) this.units.delete(id);
  }

  private hit(id: number, damage: number, color: string, kind: 'normal' | 'charge', absorbed = 0): void {
    const u = this.units.get(id);
    const { x, y } = this.pos(id);
    if (u) {
      u.hp -= damage;
      u.shield = Math.max(0, u.shield - absorbed);
      u.flash = 1;
    }
    if (absorbed) {
      this.floatText(`🛡${absorbed}`, x - 22, y - CELL * 0.35, '#8fd3ff', 15);
      this.burst(x, y - CELL * 0.25, '#b8e4ff', 10, 2, 2.5, 0, 400);
      if (!damage) return;
    }
    this.burst(x, y - CELL * 0.1, color, kind === 'charge' ? 26 : 12, kind === 'charge' ? 3.4 : 2.2, 2.8, 0.08, 500);
    this.floatText(`-${damage}`, x + (Math.random() - 0.5) * 16, y - CELL * 0.55, kind === 'charge' ? '#ffb020' : '#ffffff', kind === 'charge' ? 26 : 20);
    this.shake = Math.max(this.shake, kind === 'charge' ? 6 : 2.5);
  }

  // ---------- Partículas ----------

  private burst(x: number, y: number, color: string, n: number, speed: number, size: number, gravity: number, life: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random());
      this.particles.push(particle(x, y, Math.cos(a) * s, Math.sin(a) * s - speed * 0.4, color, size * (0.5 + Math.random()), life * (0.6 + Math.random() * 0.6), gravity, true));
    }
  }

  private smoke(x: number, y: number, color: string, n: number): void {
    for (let i = 0; i < n; i++) {
      const p = particle(x + (Math.random() - 0.5) * CELL * 0.6, y + CELL * 0.2, (Math.random() - 0.5) * 0.6, -0.4 - Math.random() * 0.6, color, 10 + Math.random() * 10, 1200, -0.005, false);
      p.drag = 0.99;
      this.particles.push(p);
    }
  }

  private dust(x: number, y: number): void {
    for (let i = 0; i < 6; i++) this.particles.push(particle(x, y, (Math.random() - 0.5) * 1.4, -Math.random() * 0.6, 'rgba(160,150,130,0.6)', 4 + Math.random() * 4, 500, 0, false));
  }

  private sparkle(u: DUnit): void {
    this.burst(px(u.x), py(u.y), '#ffd27a', 16, 1.8, 2.6, -0.02, 600);
  }

  private sfx(name: Sfx, intensity = 1): void {
    this.hooks.onSfx?.(name, intensity);
  }

  private floatText(text: string, x: number, y: number, color: string, size: number): void {
    const margin = PAD + text.length * size * 0.36;
    this.floaters.push({ text, x: Math.max(margin, Math.min(VIEW_W - margin, x)), y: Math.max(PAD + size, y), color, life: 1, size });
  }

  private orbProjectile(c: CanvasRenderingContext2D, x: number, y: number, color: string, r = 8): void {
    c.save();
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(x, y, 0, x, y, r * 2.4);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.25, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r * 2.4, 0, Math.PI * 2);
    c.fill();
    c.restore();
    if (Math.random() < 0.7) this.particles.push(particle(x, y, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, color, 3.5, 380, 0, true));
  }

  // ---------- Bucle ----------

  private loop(now: number): void {
    const dt = Math.min(50, now - (this.last || now));
    this.last = now;
    this.clock += dt;
    const k = this.mode === 'battle' ? this.speed : 1;
    if (this.playing) {
      // Cámara lenta y zoom mientras dura el golpe final.
      const slow = this.anims.find((a) => a.slow && a.started && !a.ended);
      this.time += dt * this.speed * (slow ? 0.3 : 1);
      if (slow) {
        const f = slow.slow!.focus();
        this.cam = { zoom: 1.18, x: f.x, y: f.y };
      }
      this.runAnims();
    }
    // La cámara vuelve sola al plano general.
    if (!this.anims.some((a) => a.slow && a.started && !a.ended)) {
      const k = Math.min(1, dt / 500);
      this.cam.zoom += (1 - this.cam.zoom) * k;
      this.cam.x += (VIEW_W / 2 - this.cam.x) * k;
      this.cam.y += (VIEW_H / 2 - this.cam.y) * k;
    }
    this.step(dt * k);
    this.draw();
    requestAnimationFrame((t) => this.loop(t));
  }

  private runAnims(): void {
    for (const a of this.anims) {
      if (a.ended || this.time < a.start) continue;
      if (!a.started) {
        a.started = true;
        a.onStart?.();
      }
      const p = a.duration === 0 ? 1 : Math.min(1, (this.time - a.start) / a.duration);
      a.onUpdate?.(p);
      if (p >= 1) {
        a.ended = true;
        a.onEnd?.();
      }
    }
    // Recuerda las unidades aunque mueran: las resurrecciones necesitan su tipo y bando.
    for (const [id, u] of this.units) this.deadCache.set(id, u);
  }

  private step(dt: number): void {
    const f = dt / 16.7;
    for (const p of this.particles) {
      p.vy += p.gravity * f;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx * f;
      p.y += p.vy * f;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0).slice(-900);
    for (const t of this.floaters) {
      t.life -= dt / 1100;
      t.y -= 0.45 * f;
    }
    this.floaters = this.floaters.filter((t) => t.life > 0);
    this.shake *= Math.pow(0.86, f);
    this.flash.alpha *= Math.pow(0.9, f);
    for (const u of this.units.values()) {
      u.flash *= Math.pow(0.85, f);
      u.hpShown += (u.hp - u.hpShown) * Math.min(1, 0.08 * f);
      const art = ARMOR_ART[u.look.armor];
      if (art.embers && Math.random() < 0.08 * f) {
        this.particles.push(particle(px(u.x) + (Math.random() - 0.5) * CELL * 0.5, py(u.y) + CELL * 0.2, (Math.random() - 0.5) * 0.3, -0.5 - Math.random() * 0.6, art.glow!, 2.5, 900, -0.005, true));
      }
      if (u.status.includes('attack') && Math.random() < 0.15 * f) {
        this.particles.push(particle(px(u.x) + (Math.random() - 0.5) * CELL * 0.5, py(u.y) + CELL * 0.25, 0, -0.8, STATUS_COLORS.attack, 3, 500, 0, true));
      }
    }
    // Antorchas en las esquinas del marco.
    for (const [x, y] of torchSpots()) {
      if (Math.random() < 0.6 * f) this.particles.push(particle(x + (Math.random() - 0.5) * 6, y, (Math.random() - 0.5) * 0.3, -0.8 - Math.random() * 0.8, Math.random() < 0.5 ? '#ffb347' : '#ff6a1a', 3 + Math.random() * 3, 450, -0.01, true));
    }
  }

  private draw(): void {
    const c = this.c;
    c.save();
    c.clearRect(0, 0, VIEW_W, VIEW_H);
    if (this.shake > 0.3) c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    if (this.cam.zoom > 1.001) {
      // Zoom sin salirse del tablero.
      const z = this.cam.zoom;
      const fx = Math.max(VIEW_W / (2 * z), Math.min(VIEW_W - VIEW_W / (2 * z), this.cam.x));
      const fy = Math.max(VIEW_H / (2 * z), Math.min(VIEW_H - VIEW_H / (2 * z), this.cam.y));
      c.translate(VIEW_W / 2, VIEW_H / 2);
      c.scale(z, z);
      c.translate(-fx, -fy);
    }
    if (this.bg) c.drawImage(this.bg, 0, 0, VIEW_W, VIEW_H);

    this.drawAmbient(c);
    if (this.mode === 'build') this.drawBuildOverlay(c);

    const units = [...this.units.values()].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const u of units) this.drawUnitBase(c, u);
    for (const u of units) this.drawUnit(c, u);
    for (const a of this.anims) {
      if (a.draw && a.started && !a.ended) a.draw(c, a.duration === 0 ? 1 : Math.min(1, (this.time - a.start) / a.duration));
    }
    if (this.mode === 'build' && this.ghost && this.hover && this.hover.x < DEPLOY_COLUMNS) {
      const s = spriteFor(this.ghost, this.ghost.look.race, this.ghost.look.armor, 1);
      c.globalAlpha = 0.45 + Math.sin(this.clock / 200) * 0.1;
      drawSprite(c, s, px(this.hover.x), py(this.hover.y), sizeOf(this.ghost));
      c.globalAlpha = 1;
    }
    this.drawParticles(c);
    this.drawFloaters(c);
    for (const u of units) this.drawBar(c, u);
    c.restore();
    this.drawBossBar(c);

    if (this.flash.alpha > 0.01) {
      c.fillStyle = this.flash.color;
      c.globalAlpha = this.flash.alpha;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
      c.globalAlpha = 1;
    }
  }

  private drawAmbient(c: CanvasRenderingContext2D): void {
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const [x, y] of torchSpots()) {
      const r = 70 + Math.sin(this.clock / 90 + x) * 6;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,150,60,0.28)');
      g.addColorStop(1, 'rgba(255,120,40,0)');
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    c.restore();
    // Niebla que se desplaza lentamente.
    c.save();
    for (let i = 0; i < 3; i++) {
      const x = ((this.clock / (60 + i * 25) + i * 300) % (VIEW_W + 400)) - 200;
      const y = VIEW_H * (0.3 + i * 0.22);
      const g = c.createRadialGradient(x, y, 0, x, y, 220);
      g.addColorStop(0, 'rgba(200,210,230,0.05)');
      g.addColorStop(1, 'rgba(200,210,230,0)');
      c.fillStyle = g;
      c.fillRect(x - 220, y - 220, 440, 440);
    }
    c.restore();
  }

  private drawBuildOverlay(c: CanvasRenderingContext2D): void {
    const pulse = 0.5 + Math.sin(this.clock / 500) * 0.5;
    const g = c.createLinearGradient(PAD, 0, PAD + DEPLOY_COLUMNS * CELL, 0);
    g.addColorStop(0, `rgba(70,200,255,${0.06 + pulse * 0.05})`);
    g.addColorStop(1, `rgba(70,200,255,${0.14 + pulse * 0.08})`);
    c.fillStyle = g;
    c.fillRect(PAD, PAD, DEPLOY_COLUMNS * CELL, BOARD_HEIGHT * CELL);
    c.strokeStyle = `rgba(120,220,255,${0.4 + pulse * 0.4})`;
    c.lineWidth = 2;
    c.setLineDash([8, 6]);
    c.strokeRect(PAD + 1, PAD + 1, DEPLOY_COLUMNS * CELL - 2, BOARD_HEIGHT * CELL - 2);
    c.setLineDash([]);
    if (this.hover) {
      const ok = this.hover.x < DEPLOY_COLUMNS;
      c.fillStyle = ok ? 'rgba(255,220,120,0.18)' : 'rgba(255,80,80,0.12)';
      c.fillRect(PAD + this.hover.x * CELL + 2, PAD + this.hover.y * CELL + 2, CELL - 4, CELL - 4);
    }
  }

  private drawUnitBase(c: CanvasRenderingContext2D, u: DUnit): void {
    const x = px(u.x) + u.offX;
    const y = py(u.y) + CELL * 0.3 + u.offY;
    c.save();
    c.globalAlpha = u.alpha;
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.beginPath();
    c.ellipse(x, y, CELL * 0.32 * u.scale, CELL * 0.1 * u.scale, 0, 0, Math.PI * 2);
    c.fill();
    const team = u.special?.kind === 'commander' ? '#ffd24a' : u.side === this.mySide ? TEAM_COLORS.ally : TEAM_COLORS.enemy;
    c.shadowColor = team;
    c.shadowBlur = 10;
    c.strokeStyle = team;
    c.lineWidth = 2.2;
    c.beginPath();
    c.ellipse(x, y, CELL * 0.36 * u.scale, CELL * 0.12 * u.scale, 0, 0, Math.PI * 2);
    c.stroke();
    c.shadowBlur = 0;
    const aura = ARMOR_ART[u.look.armor].aura;
    if (aura > 0) {
      const glow = ARMOR_ART[u.look.armor].glow ?? '#ffffff';
      const r = CELL * (0.55 + Math.sin(this.clock / 400 + u.phase) * 0.04);
      c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(x, y - CELL * 0.35, 0, x, y - CELL * 0.35, r);
      g.addColorStop(0, hexA(glow, 0.28 * aura));
      g.addColorStop(1, hexA(glow, 0));
      c.fillStyle = g;
      c.fillRect(x - r, y - CELL * 0.35 - r, r * 2, r * 2);
    }
    for (const s of u.status) {
      if (s === 'attack' || s === 'armor' || s === 'speed') ringPulse(c, x, y, CELL * (0.4 + Math.sin(this.clock / 250) * 0.03), STATUS_COLORS[s], 0.7);
      if (s === 'thorns') spikes(c, x, y, CELL * 0.42, this.clock);
      if (s === 'weakened') ringPulse(c, x, y, CELL * 0.38, '#c792ea', 0.6);
    }
    c.restore();
  }

  private drawUnit(c: CanvasRenderingContext2D, u: DUnit): void {
    const bob = this.mode === 'battle' || u.side === 0 ? Math.sin(this.clock / 480 + u.phase) * 1.4 : 0;
    const x = px(u.x) + u.offX;
    const y = py(u.y) + u.offY + bob;
    const facing = u.side === 0 ? 1 : -1;
    const scale = u.scale * sizeOf(u);
    c.save();
    c.globalAlpha = u.alpha;
    drawSprite(c, spriteFor(u, u.look.race, u.look.armor, facing), x, y, scale);
    if (u.flash > 0.05) {
      c.globalAlpha = u.alpha * u.flash;
      drawSprite(c, spriteFor(u, u.look.race, u.look.armor, facing, true), x, y, scale);
    }
    if (u.status.includes('poison')) {
      c.globalAlpha = 0.25 + Math.sin(this.clock / 200) * 0.1;
      c.globalCompositeOperation = 'lighter';
      drawSprite(c, spriteFor(u, u.look.race, u.look.armor, facing, true), x, y, scale);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      if (Math.random() < 0.08) this.particles.push(particle(x + (Math.random() - 0.5) * CELL * 0.4, y, 0, -0.6, '#8fdf4a', 3, 700, -0.01, true));
    }
    if (u.shield > 0) bubble(c, x, y - CELL * 0.25 * scale, CELL * 0.5 * scale, '#8fd3ff', 0.55 + Math.sin(this.clock / 300) * 0.1);
    if (u.status.includes('stunned')) {
      c.globalAlpha = 0.45;
      c.globalCompositeOperation = 'lighter';
      drawSprite(c, spriteFor(u, u.look.race, u.look.armor, facing, true), x, y, scale);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 0.8;
      c.fillStyle = 'rgba(168,232,255,0.35)';
      c.strokeStyle = '#e8f8ff';
      c.lineWidth = 1.5;
      for (const [dx, h] of [[-0.22, 0.5], [0.05, 0.7], [0.25, 0.45]] as const) {
        c.beginPath();
        c.moveTo(x + dx * CELL - 6, y + CELL * 0.3);
        c.lineTo(x + dx * CELL, y + CELL * (0.3 - h));
        c.lineTo(x + dx * CELL + 6, y + CELL * 0.3);
        c.closePath();
        c.fill();
        c.stroke();
      }
    }
    c.restore();
  }

  private drawBar(c: CanvasRenderingContext2D, u: DUnit): void {
    if (u.alpha < 0.3) return;
    const w = CELL * 0.62;
    const x = px(u.x) + u.offX - w / 2;
    const y = py(u.y) + u.offY - CELL * (u.type === 'golem' ? 0.95 : 0.78);
    const ratio = Math.max(0, u.hp / u.maxHp);
    const shown = Math.max(0, Math.min(1, u.hpShown / u.maxHp));
    const ally = u.side === this.mySide;
    c.save();
    c.globalAlpha = u.alpha;
    c.fillStyle = 'rgba(8,8,12,0.85)';
    c.beginPath();
    c.roundRect(x - 2, y - 2, w + 4, 9, 4);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.fillRect(x, y, w * Math.max(ratio, shown), 5);
    const g = c.createLinearGradient(0, y, 0, y + 5);
    g.addColorStop(0, ally ? '#8ff0ff' : '#ff8a8a');
    g.addColorStop(1, ally ? '#1f8fd6' : '#b01818');
    c.fillStyle = g;
    c.fillRect(x, y, w * ratio, 5);
    c.strokeStyle = ARMOR_ART[u.look.armor].gems ? '#ffd27a' : 'rgba(255,255,255,0.25)';
    c.lineWidth = 1;
    c.beginPath();
    c.roundRect(x - 2, y - 2, w + 4, 9, 4);
    c.stroke();
    c.restore();
  }

  /** Barra de vida grande para los jefes de incursión. */
  private drawBossBar(c: CanvasRenderingContext2D): void {
    const boss = [...this.units.values()].find((u) => u.special?.kind === 'boss');
    if (!boss || boss.special?.kind !== 'boss') return;
    const def = BOSSES[boss.special.id];
    const w = VIEW_W * 0.6;
    const x = (VIEW_W - w) / 2;
    const y = PAD + 30;
    const ratio = Math.max(0, boss.hp / boss.maxHp);
    const shown = Math.max(0, Math.min(1, boss.hpShown / boss.maxHp));
    c.save();
    c.fillStyle = 'rgba(8,4,4,0.85)';
    c.beginPath(); c.roundRect(x - 4, y - 4, w + 8, 20, 6); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fillRect(x, y, w * Math.max(ratio, shown), 12);
    const g = c.createLinearGradient(0, y, 0, y + 12);
    g.addColorStop(0, '#ff8a3a');
    g.addColorStop(1, '#8a0a0a');
    c.fillStyle = g;
    c.fillRect(x, y, w * ratio, 12);
    c.strokeStyle = '#e8c164';
    c.lineWidth = 1.5;
    c.beginPath(); c.roundRect(x - 4, y - 4, w + 8, 20, 6); c.stroke();
    c.font = '900 14px Cinzel, Georgia, serif';
    c.textAlign = 'center';
    c.fillStyle = '#fff0b3';
    c.strokeStyle = '#000';
    c.lineWidth = 3;
    const label = `${def.name}, ${def.title} · ${Math.max(0, Math.ceil(boss.hp))} / ${boss.maxHp}`;
    c.strokeText(label, VIEW_W / 2, y + 30);
    c.fillText(label, VIEW_W / 2, y + 30);
    c.restore();
  }

  private drawParticles(c: CanvasRenderingContext2D): void {
    c.save();
    for (const p of this.particles) {
      const t = Math.max(0, p.life / p.max);
      c.globalCompositeOperation = p.additive ? 'lighter' : 'source-over';
      c.globalAlpha = p.additive ? t : t * 0.5;
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, p.size * (p.additive ? t : 1.5 - t * 0.5), 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  private drawFloaters(c: CanvasRenderingContext2D): void {
    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const t of this.floaters) {
      const pop = t.life > 0.85 ? 1 + (t.life - 0.85) * 3 : 1;
      c.globalAlpha = Math.min(1, t.life * 2);
      c.font = `900 ${Math.round(t.size * pop)}px Cinzel, Georgia, serif`;
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(0,0,0,0.85)';
      c.strokeText(t.text, t.x, t.y);
      c.fillStyle = t.color;
      c.fillText(t.text, t.x, t.y);
    }
    c.restore();
  }
}

// ---------- Utilidades de dibujo ----------

function particle(x: number, y: number, vx: number, vy: number, color: string, size: number, life: number, gravity: number, additive: boolean): Particle {
  return { x, y, vx, vy, color, size, life, max: life, gravity, additive, drag: 0.97 };
}

function drawSprite(c: CanvasRenderingContext2D, sprite: HTMLCanvasElement, x: number, y: number, scale: number): void {
  const s = CELL * 1.28 * scale;
  const feet = y + CELL * 0.3;
  c.drawImage(sprite, x - s / 2, feet - s * 0.9, s, s);
}

function drawArrow(c: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string): void {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.strokeStyle = '#6b4524';
  c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(-18, 0); c.lineTo(8, 0); c.stroke();
  c.fillStyle = color;
  c.beginPath(); c.moveTo(14, 0); c.lineTo(6, -4); c.lineTo(6, 4); c.closePath(); c.fill();
  c.fillStyle = '#f4efe2';
  c.beginPath(); c.moveTo(-18, 0); c.lineTo(-23, -4); c.lineTo(-14, 0); c.lineTo(-23, 4); c.closePath(); c.fill();
  c.restore();
}

function bubble(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void {
  if (r <= 0) return;
  c.save();
  c.globalAlpha = Math.max(0, alpha);
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, 'rgba(255,255,255,0.05)');
  g.addColorStop(0.8, hexA(color, 0.18));
  g.addColorStop(1, hexA(color, 0.55));
  c.fillStyle = g;
  c.strokeStyle = hexA(color, 0.9);
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.restore();
}

function spikes(c: CanvasRenderingContext2D, x: number, y: number, r: number, clock: number): void {
  c.save();
  c.translate(x, y);
  c.scale(1, 0.35);
  c.rotate(clock / 1500);
  c.fillStyle = '#3fbf6a';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    c.beginPath();
    c.moveTo(Math.cos(a - 0.12) * r, Math.sin(a - 0.12) * r);
    c.lineTo(Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25);
    c.lineTo(Math.cos(a + 0.12) * r, Math.sin(a + 0.12) * r);
    c.fill();
  }
  c.restore();
}

function ringPulse(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void {
  c.save();
  c.globalAlpha = Math.max(0, alpha);
  c.strokeStyle = color;
  c.shadowColor = color;
  c.shadowBlur = 12;
  c.lineWidth = 2.5;
  c.beginPath();
  c.ellipse(x, y, r, r * 0.35, 0, 0, Math.PI * 2);
  c.stroke();
  c.restore();
}

function lightning(c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, alpha: number): void {
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const [w, col] of [[7, 'rgba(168,77,255,0.5)'], [2.5, 'rgba(240,230,255,0.95)']] as const) {
    c.strokeStyle = col;
    c.lineWidth = w;
    c.globalAlpha = alpha;
    c.shadowColor = '#a84dff';
    c.shadowBlur = 18;
    c.beginPath();
    c.moveTo(x1, y1);
    const n = 8;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      c.lineTo(lerp(x1, x2, t) + (Math.random() - 0.5) * 22, lerp(y1, y2, t) + (Math.random() - 0.5) * 22);
    }
    c.lineTo(x2, y2);
    c.stroke();
  }
  c.restore();
}

function portal(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, clock: number, alpha: number): void {
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = alpha;
  c.translate(x, y);
  c.scale(1, 0.4);
  c.strokeStyle = color;
  c.shadowColor = color;
  c.shadowBlur = 16;
  for (const [rr, w] of [[r, 3], [r * 0.72, 1.5]] as const) {
    c.lineWidth = w;
    c.beginPath();
    c.arc(0, 0, rr, 0, Math.PI * 2);
    c.stroke();
  }
  c.rotate(clock / 400);
  c.lineWidth = 2;
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    c.moveTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
    c.lineTo(Math.cos(a + 2.1) * r * 0.72, Math.sin(a + 2.1) * r * 0.72);
  }
  c.stroke();
  c.restore();
}

function lightPillar(c: CanvasRenderingContext2D, x: number, y: number, color: string, alpha: number): void {
  c.save();
  c.globalCompositeOperation = 'lighter';
  const g = c.createLinearGradient(x - CELL * 0.4, 0, x + CELL * 0.4, 0);
  g.addColorStop(0, hexA(color, 0));
  g.addColorStop(0.5, hexA(color, 0.75 * alpha));
  g.addColorStop(1, hexA(color, 0));
  c.fillStyle = g;
  c.fillRect(x - CELL * 0.4, 0, CELL * 0.8, y + CELL * 0.35);
  c.restore();
}

function torchSpots(): Array<[number, number]> {
  return [[PAD * 0.5, PAD * 0.5], [VIEW_W - PAD * 0.5, PAD * 0.5], [PAD * 0.5, VIEW_H - PAD * 0.5], [VIEW_W - PAD * 0.5, VIEW_H - PAD * 0.5]];
}

function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Campo de batalla pre-renderizado: losas de piedra, runas centrales y marco dorado. */
function renderBoard(dpr: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = VIEW_W * dpr;
  canvas.height = VIEW_H * dpr;
  const c = canvas.getContext('2d')!;
  c.scale(dpr, dpr);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  c.fillStyle = '#07080c';
  c.fillRect(0, 0, VIEW_W, VIEW_H);
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const left = x < BOARD_WIDTH / 2;
      const l = 17 + rnd() * 7;
      const x0 = PAD + x * CELL;
      const y0 = PAD + y * CELL;
      const g = c.createLinearGradient(x0, y0, x0 + CELL, y0 + CELL);
      g.addColorStop(0, `hsl(${left ? 215 : 12}, ${left ? 14 : 12}%, ${l + 5}%)`);
      g.addColorStop(1, `hsl(${left ? 220 : 8}, ${left ? 16 : 14}%, ${l - 4}%)`);
      c.fillStyle = g;
      c.beginPath();
      c.roundRect(x0 + 2, y0 + 2, CELL - 4, CELL - 4, 6);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.07)';
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x0 + 4, y0 + CELL - 5); c.lineTo(x0 + 4, y0 + 4); c.lineTo(x0 + CELL - 5, y0 + 4); c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.45)';
      c.beginPath(); c.moveTo(x0 + CELL - 3, y0 + 4); c.lineTo(x0 + CELL - 3, y0 + CELL - 3); c.lineTo(x0 + 4, y0 + CELL - 3); c.stroke();
      if (rnd() < 0.35) {
        c.strokeStyle = 'rgba(0,0,0,0.5)';
        c.lineWidth = 1.2;
        c.beginPath();
        let cx = x0 + 10 + rnd() * (CELL - 20);
        let cy = y0 + 8;
        c.moveTo(cx, cy);
        for (let i = 0; i < 4; i++) { cx += (rnd() - 0.5) * 18; cy += 8 + rnd() * 10; c.lineTo(cx, cy); }
        c.stroke();
      }
      if (rnd() < 0.2) {
        c.fillStyle = 'rgba(80,120,60,0.25)';
        c.beginPath();
        c.ellipse(x0 + CELL * (0.2 + rnd() * 0.6), y0 + CELL * (0.7 + rnd() * 0.2), 8 + rnd() * 8, 3 + rnd() * 3, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
  // Línea rúnica central entre ambos bandos.
  const mid = PAD + (BOARD_WIDTH / 2) * CELL;
  c.save();
  c.strokeStyle = 'rgba(255,200,110,0.35)';
  c.shadowColor = '#ffb347';
  c.shadowBlur = 10;
  c.lineWidth = 2;
  c.setLineDash([10, 8]);
  c.beginPath(); c.moveTo(mid, PAD + 6); c.lineTo(mid, VIEW_H - PAD - 6); c.stroke();
  c.restore();
  // Viñeta.
  const v = c.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.7);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  c.fillStyle = v;
  c.fillRect(0, 0, VIEW_W, VIEW_H);
  // Marco dorado ornamentado.
  const gold = c.createLinearGradient(0, 0, VIEW_W, VIEW_H);
  gold.addColorStop(0, '#fff0b3');
  gold.addColorStop(0.3, '#c9962e');
  gold.addColorStop(0.6, '#7a5412');
  gold.addColorStop(1, '#e8c164');
  c.strokeStyle = gold;
  c.lineWidth = 5;
  c.beginPath(); c.roundRect(PAD * 0.45, PAD * 0.45, VIEW_W - PAD * 0.9, VIEW_H - PAD * 0.9, 10); c.stroke();
  c.lineWidth = 1.5;
  c.beginPath(); c.roundRect(PAD * 0.8, PAD * 0.8, VIEW_W - PAD * 1.6, VIEW_H - PAD * 1.6, 6); c.stroke();
  for (const [x, y] of torchSpots()) {
    c.fillStyle = gold;
    c.beginPath(); c.moveTo(x, y - 12); c.lineTo(x + 12, y); c.lineTo(x, y + 12); c.lineTo(x - 12, y); c.closePath(); c.fill();
    c.fillStyle = '#2a1a0a';
    c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill();
  }
  for (const x of [VIEW_W / 2]) {
    for (const y of [PAD * 0.45, VIEW_H - PAD * 0.45]) {
      c.fillStyle = gold;
      c.beginPath(); c.moveTo(x, y - 9); c.lineTo(x + 16, y); c.lineTo(x, y + 9); c.lineTo(x - 16, y); c.closePath(); c.fill();
    }
  }
  return canvas;
}
