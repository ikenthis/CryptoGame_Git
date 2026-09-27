import type { CardEffect, Rarity } from './cards.ts';
import type { Race, StatMods } from './races.ts';
import type { UnitStats, UnitType } from './rules.ts';

// Comandantes: todo ejército lleva uno. Es una unidad más en el tablero, gratis
// (no gasta oro), con una pasiva que mejora a sus tropas y una habilidad que se
// dispara sola una vez por batalla. Si cae, sus tropas pierden 1 de ataque
// (moral rota) el resto de la batalla. Como en las cartas, la rareza indica lo
// especial que es, no cuánto más fuerte: todos están equilibrados entre sí.

export type CommanderId =
  | 'aldric' | 'seraphine'
  | 'lyra' | 'thalanor'
  | 'grok' | 'magthar'
  | 'velka' | 'morvath'
  | 'borin' | 'brunhild';

/** Cuándo se dispara la habilidad (una sola vez). */
export type AbilityTrigger = 'start' | 'hp50' | 'firstDeath' | { turn: number };

export interface CommanderDef {
  id: CommanderId;
  name: string;
  title: string;
  race: Race;
  rarity: Rarity;
  /** Aspecto base del sprite y forma de combatir. */
  archetype: UnitType;
  stats: Pick<UnitStats, 'hp' | 'attack' | 'range' | 'speed' | 'armor' | 'chargeBonus' | 'splash' | 'ignoresArmor' | 'heal'>;
  passive: { name: string; text: string; mods: Partial<Record<UnitType, StatMods>> };
  ability: { name: string; text: string; trigger: AbilityTrigger; effects: CardEffect[] };
  lore: string;
}

const base = { chargeBonus: 0, splash: 0, ignoresArmor: false, heal: 0 };

export const COMMANDERS: Record<CommanderId, CommanderDef> = {
  aldric: {
    id: 'aldric', name: 'Aldric', title: 'Capitán de la Guardia', race: 'human', rarity: 'common', archetype: 'guardian',
    stats: { ...base, hp: 20, attack: 3, range: 1, speed: 1, armor: 2 },
    passive: { name: 'Escuadra', text: 'Guerreros +2 de vida.', mods: { warrior: { hp: 2 } } },
    ability: {
      name: '¡Formación!', text: 'Al empezar: aliados +1 de armadura durante 3 turnos.', trigger: 'start',
      effects: [{ kind: 'buff', stat: 'armor', amount: 1, duration: 3 }],
    },
    lore: 'Nunca ha perdido una muralla. Tampoco ha perdido la calma.',
  },
  seraphine: {
    id: 'seraphine', name: 'Seraphine', title: 'Reina Solar de Aurelia', race: 'human', rarity: 'legendary', archetype: 'knight',
    stats: { ...base, hp: 14, attack: 3, range: 1, speed: 2, armor: 1, chargeBonus: 2 },
    passive: { name: 'Estandarte Real', text: 'Caballeros +1 de ataque.', mods: { knight: { attack: 1 } } },
    ability: {
      name: 'Amanecer de Aurelia', text: 'Al bajar de la mitad de vida: cura 4 a todos los aliados.', trigger: 'hp50',
      effects: [{ kind: 'heal', amount: 4, target: 'all' }],
    },
    lore: 'Cuando su espada toca el cielo, el sol responde.',
  },
  lyra: {
    id: 'lyra', name: 'Lyra', title: 'Exploradora del Alba', race: 'elf', rarity: 'uncommon', archetype: 'archer',
    stats: { ...base, hp: 16, attack: 4, range: 4, speed: 1, armor: 0 },
    passive: { name: 'Ojo Certero', text: 'Arqueros +1 de ataque.', mods: { archer: { attack: 1 } } },
    ability: {
      name: 'Disparo del Alba', text: 'Al empezar: 5 de daño al enemigo con menos vida.', trigger: 'start',
      effects: [{ kind: 'damage', amount: 5, target: 'weakest' }],
    },
    lore: 'Dicen que su primera flecha siempre encuentra al más débil.',
  },
  thalanor: {
    id: 'thalanor', name: 'Thalanor', title: 'Archidruida de Sylvaran', race: 'elf', rarity: 'epic', archetype: 'healer',
    stats: { ...base, hp: 14, attack: 0, range: 2, speed: 1, armor: 0, heal: 4 },
    passive: { name: 'Savia Antigua', text: 'Guardianes +3 de vida.', mods: { guardian: { hp: 3 } } },
    ability: {
      name: 'Renacer del Bosque', text: 'Cuando cae el primer aliado: escudo de 3 a todos los aliados.', trigger: 'firstDeath',
      effects: [{ kind: 'shield', amount: 3, target: 'all' }],
    },
    lore: 'Tiene la edad de los robles que protege.',
  },
  grok: {
    id: 'grok', name: 'Grok', title: 'el Rompehuesos', race: 'orc', rarity: 'common', archetype: 'warrior',
    stats: { ...base, hp: 24, attack: 4, range: 1, speed: 1, armor: 1 },
    passive: { name: 'Carne de Cañón', text: 'Guerreros +1 de ataque.', mods: { warrior: { attack: 1 } } },
    ability: {
      name: 'Rugido de Guerra', text: 'Cuando cae el primer aliado: aliados +2 de ataque durante 2 turnos.', trigger: 'firstDeath',
      effects: [{ kind: 'buff', stat: 'attack', amount: 2, duration: 2 }],
    },
    lore: 'Su nombre es el sonido que hacen los huesos al romperse.',
  },
  magthar: {
    id: 'magthar', name: "Mag'thar", title: 'Caudillo de Ceniza', race: 'orc', rarity: 'legendary', archetype: 'knight',
    stats: { ...base, hp: 15, attack: 3, range: 1, speed: 2, armor: 1, chargeBonus: 2 },
    passive: { name: 'Jinetes de Lobo', text: 'Caballeros +2 de vida.', mods: { knight: { hp: 2 } } },
    ability: {
      name: 'Estampida', text: 'Al empezar: aliados +1 de velocidad durante 2 turnos.', trigger: 'start',
      effects: [{ kind: 'buff', stat: 'speed', amount: 1, duration: 2 }],
    },
    lore: 'Cabalga delante. Siempre delante.',
  },
  velka: {
    id: 'velka', name: 'Velka', title: 'Nigromante del Velo', race: 'undead', rarity: 'rare', archetype: 'mage',
    stats: { ...base, hp: 15, attack: 3, range: 2, speed: 1, armor: 0, ignoresArmor: true },
    passive: { name: 'Huesos Duros', text: 'Guerreros +1 de armadura.', mods: { warrior: { armor: 1 } } },
    ability: {
      name: 'Levantar Muertos', text: 'Cuando cae el primer aliado: lo revive con la mitad de vida.', trigger: 'firstDeath',
      effects: [{ kind: 'revive', which: 'best', hp: 'half' }],
    },
    lore: 'Para ella, un campo de batalla es una cantera.',
  },
  morvath: {
    id: 'morvath', name: 'Morvath', title: 'Rey Lich', race: 'undead', rarity: 'legendary', archetype: 'mage',
    stats: { ...base, hp: 14, attack: 3, range: 2, speed: 1, armor: 0, splash: 1, ignoresArmor: true },
    passive: { name: 'Frío de la Tumba', text: 'Magos +2 de vida.', mods: { mage: { hp: 2 } } },
    ability: {
      name: 'Plaga Eterna', text: 'En el turno 3: envenena al grupo enemigo (2 por turno, 3 turnos).', trigger: { turn: 3 },
      effects: [{ kind: 'poison', amount: 2, duration: 3, target: 'cluster', spread: true }],
    },
    lore: 'Su corona pesa mil años. Su paciencia, más.',
  },
  borin: {
    id: 'borin', name: 'Borin', title: 'Thane de Durnhal', race: 'dwarf', rarity: 'common', archetype: 'guardian',
    stats: { ...base, hp: 20, attack: 3, range: 1, speed: 1, armor: 2 },
    passive: { name: 'Martillo y Yunque', text: 'Guardianes +1 de ataque.', mods: { guardian: { attack: 1 } } },
    ability: {
      name: 'Muro de Escudos', text: 'Al empezar: escudo de 2 a todos los aliados.', trigger: 'start',
      effects: [{ kind: 'shield', amount: 2, target: 'all' }],
    },
    lore: 'Ha forjado más escudos de los que ha contado enemigos.',
  },
  brunhild: {
    id: 'brunhild', name: 'Brunhild', title: 'Forjarunas', race: 'dwarf', rarity: 'epic', archetype: 'warrior',
    stats: { ...base, hp: 18, attack: 4, range: 1, speed: 1, armor: 2 },
    passive: { name: 'Runas de Fuego', text: 'Arqueros +1 de alcance.', mods: { archer: { range: 1 } } },
    ability: {
      name: 'Martillo Sísmico', text: 'Al bajar de la mitad de vida: 2 de daño a todos y aturde al más adelantado.', trigger: 'hp50',
      effects: [{ kind: 'volley', amount: 2 }, { kind: 'stun', duration: 1, target: 'frontline' }],
    },
    lore: 'Cada runa que talla es una promesa. Cada golpe, una que cumple.',
  },
};

export const COMMANDER_IDS = Object.keys(COMMANDERS) as CommanderId[];

export function isCommanderId(value: unknown): value is CommanderId {
  return typeof value === 'string' && Object.hasOwn(COMMANDERS, value);
}

export function commandersForRace(race: Race): CommanderDef[] {
  return COMMANDER_IDS.map((id) => COMMANDERS[id]).filter((c) => c.race === race);
}

/** Valor del comandante para la puntuación por tiempo (equivale a 6 de oro). */
export const COMMANDER_VALUE = 6;
