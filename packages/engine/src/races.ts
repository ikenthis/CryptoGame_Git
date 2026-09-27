import { UNITS, type UnitStats, type UnitType } from './rules.ts';

// Cada raza modifica las unidades base con ventajas y desventajas. La identidad
// sale de ahí y de su carta legendaria, no de tener unidades más caras o mejores.

export type Race = 'human' | 'elf' | 'orc' | 'undead' | 'dwarf';

export type StatMods = Partial<Pick<UnitStats, 'hp' | 'attack' | 'range' | 'speed' | 'armor' | 'heal'>>;

export interface RaceInfo {
  name: string;
  realm: string;
  trait: string;
  description: string;
  mods: Partial<Record<UnitType, StatMods>>;
  /** La primera unidad aliada que cae se levanta con la mitad de su vida (una vez por batalla). */
  undying?: boolean;
}

export const RACES: Record<Race, RaceInfo> = {
  human: {
    name: 'Humanos',
    realm: 'Reino de Aurelia',
    trait: 'Disciplina',
    description: 'Guerreros con armadura +1 y Caballeros con vida +2.',
    mods: { warrior: { armor: 1 }, knight: { hp: 2 } },
  },
  elf: {
    name: 'Elfos',
    realm: 'Bosque de Sylvaran',
    trait: 'Ojo de halcón',
    description: 'Arqueros con alcance +1 y Sanadores que curan +1. Guardianes con vida −2.',
    mods: { archer: { range: 1 }, healer: { heal: 1 }, guardian: { hp: -2 } },
  },
  orc: {
    name: 'Orcos',
    realm: 'Clanes de Ceniza',
    trait: 'Sed de sangre',
    description: 'Guerreros con vida +3 y Caballeros con ataque +1. Arqueros con alcance −1.',
    mods: { warrior: { hp: 3 }, knight: { attack: 1 }, archer: { range: -1 } },
  },
  undead: {
    name: 'No-muertos',
    realm: 'Legión Sombría',
    trait: 'Inmortales',
    description: 'La primera unidad que cae se levanta con la mitad de su vida. Sanadores curan −1.',
    mods: { healer: { heal: -1 } },
    undying: true,
  },
  dwarf: {
    name: 'Enanos',
    realm: 'Forja de Durnhal',
    trait: 'Hierro ancestral',
    description: 'Guardianes y Guerreros con armadura +1. Caballeros con velocidad −1.',
    mods: { guardian: { armor: 1 }, warrior: { armor: 1 }, knight: { speed: -1 } },
  },
};

export const RACE_IDS = Object.keys(RACES) as Race[];

export function isRace(value: unknown): value is Race {
  return typeof value === 'string' && Object.hasOwn(RACES, value);
}

/** Estadísticas de una unidad con los modificadores de su raza aplicados. */
export function statsFor(type: UnitType, race: Race, extra: StatMods = {}): UnitStats {
  const base = UNITS[type];
  const mods = RACES[race].mods[type] ?? {};
  const sum = (k: keyof StatMods) => (mods[k] ?? 0) + (extra[k] ?? 0);
  return {
    ...base,
    hp: base.hp + sum('hp'),
    attack: base.attack + sum('attack'),
    range: Math.max(1, base.range + sum('range')),
    speed: Math.max(1, base.speed + sum('speed')),
    armor: base.armor + sum('armor'),
    heal: base.heal > 0 ? Math.max(1, base.heal + sum('heal')) : 0,
  };
}
