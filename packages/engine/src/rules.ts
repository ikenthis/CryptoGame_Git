// Reglas y estadísticas del juego. Todo número aquí es de balance: cambiarlo
// cambia el metajuego, así que cada ajuste debe pasar por el script de balance
// y quedar registrado en docs/GDD.md.

export const BOARD_WIDTH = 8;
export const BOARD_HEIGHT = 6;
/** Columnas propias donde cada jugador puede desplegar (0..DEPLOY_COLUMNS-1). */
export const DEPLOY_COLUMNS = 3;
export const BUDGET = 12;
export const MAX_UNITS = 6;
export const MAX_TURNS = 40;

export type UnitType = 'warrior' | 'archer' | 'knight' | 'guardian' | 'mage' | 'healer';

export interface UnitStats {
  name: string;
  letter: string;
  cost: number;
  hp: number;
  attack: number;
  range: number;
  speed: number;
  armor: number;
  /** Daño extra si la unidad se movió en el mismo turno antes de atacar. */
  chargeBonus: number;
  /** Daño a enemigos adyacentes al objetivo. */
  splash: number;
  ignoresArmor: boolean;
  /** Vida que restaura a un aliado por turno (si > 0, la unidad no ataca). */
  heal: number;
  description: string;
}

export const UNITS: Record<UnitType, UnitStats> = {
  warrior: {
    name: 'Guerrero', letter: 'G', cost: 2, hp: 10, attack: 3, range: 1, speed: 1, armor: 0,
    chargeBonus: 0, splash: 0, ignoresArmor: false, heal: 0,
    description: 'Barato y sólido. Ideal para rellenar el frente.',
  },
  archer: {
    name: 'Arquero', letter: 'A', cost: 3, hp: 6, attack: 3, range: 3, speed: 1, armor: 0,
    chargeBonus: 0, splash: 0, ignoresArmor: false, heal: 0,
    description: 'Ataca desde lejos. Frágil si lo alcanzan.',
  },
  knight: {
    name: 'Caballero', letter: 'C', cost: 4, hp: 12, attack: 3, range: 1, speed: 2, armor: 1,
    chargeBonus: 4, splash: 0, ignoresArmor: false, heal: 0,
    description: 'Rápido. Si se mueve y ataca en el mismo turno, carga (+4 de daño).',
  },
  guardian: {
    name: 'Guardián', letter: 'E', cost: 3, hp: 14, attack: 2, range: 1, speed: 1, armor: 2,
    chargeBonus: 0, splash: 0, ignoresArmor: false, heal: 0,
    description: 'Muro con armadura 2. Frena cargas y flechas.',
  },
  mage: {
    name: 'Mago', letter: 'M', cost: 4, hp: 6, attack: 3, range: 2, speed: 1, armor: 0,
    chargeBonus: 0, splash: 2, ignoresArmor: true, heal: 0,
    description: 'Ignora armadura y salpica 2 de daño a enemigos pegados al objetivo.',
  },
  healer: {
    name: 'Sanador', letter: 'S', cost: 3, hp: 7, attack: 0, range: 2, speed: 1, armor: 0,
    chargeBonus: 0, splash: 0, ignoresArmor: false, heal: 3,
    description: 'Cura 3 al aliado más herido a su alcance. No ataca.',
  },
};

export const UNIT_TYPES = Object.keys(UNITS) as UnitType[];

export function isUnitType(value: unknown): value is UnitType {
  return typeof value === 'string' && Object.hasOwn(UNITS, value);
}
