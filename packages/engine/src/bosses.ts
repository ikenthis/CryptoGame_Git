import type { CardEffect } from './cards.ts';
import type { UnitStats } from './rules.ts';

// Jefes de incursión: criaturas enormes que solo aparecen en el modo campaña.
// Cada pocos turnos desatan un ataque especial.

export type BossId = 'ash-dragon' | 'void-colossus';

export interface BossDef {
  id: BossId;
  name: string;
  title: string;
  /** Forma del sprite. */
  look: 'dragon' | 'colossus';
  stats: Pick<UnitStats, 'hp' | 'attack' | 'range' | 'speed' | 'armor' | 'splash' | 'ignoresArmor'>;
  special: { name: string; every: number; effects: CardEffect[] };
  lore: string;
}

export const BOSSES: Record<BossId, BossDef> = {
  'ash-dragon': {
    id: 'ash-dragon', name: 'Vermithrax', title: 'Dragón de Ceniza', look: 'dragon',
    stats: { hp: 70, attack: 5, range: 2, speed: 1, armor: 2, splash: 2, ignoresArmor: false },
    special: {
      name: 'Aliento de Fuego', every: 3,
      effects: [{ kind: 'damage', amount: 5, target: 'cluster', splash: 3, ignoresArmor: true }],
    },
    lore: 'Duerme bajo el volcán. Cuando despierta, el cielo se vuelve gris.',
  },
  'void-colossus': {
    id: 'void-colossus', name: 'Xal-Azar', title: 'Coloso del Vacío', look: 'colossus',
    stats: { hp: 85, attack: 6, range: 1, speed: 1, armor: 3, splash: 2, ignoresArmor: false },
    special: {
      name: 'Pulso del Vacío', every: 4,
      effects: [{ kind: 'volley', amount: 2 }, { kind: 'stun', duration: 1, target: 'strongest' }],
    },
    lore: 'Nadie sabe de dónde vino. Todos saben lo que deja.',
  },
};

export const BOSS_VALUE = 20;
