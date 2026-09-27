import type { Army } from './army.ts';

/** Ejércitos de la IA para practicar y para el script de balance. Todos cuestan 12 de oro. */
export const PRESET_ARMIES: Record<string, { name: string; army: Army }> = {
  horde: {
    name: 'Horda de Ceniza',
    army: {
      race: 'orc',
      armor: 'iron',
      units: [0, 1, 2, 3, 4, 5].map((y) => ({ type: 'warrior' as const, x: 2, y })),
      cards: [{ card: 'ash-fury', turn: 2 }, { card: 'fire-arrow', turn: 1 }],
    },
  },
  wall: {
    name: 'Muralla de Durnhal',
    army: {
      race: 'dwarf',
      armor: 'steel',
      units: [
        { type: 'guardian', x: 2, y: 1 },
        { type: 'guardian', x: 2, y: 4 },
        { type: 'archer', x: 0, y: 2 },
        { type: 'archer', x: 0, y: 3 },
      ],
      cards: [{ card: 'ancestral-golem', turn: 3 }, { card: 'fire-arrow', turn: 2 }],
    },
  },
  cavalry: {
    name: 'Caballería de Aurelia',
    army: {
      race: 'human',
      armor: 'royal',
      units: [
        { type: 'knight', x: 2, y: 1 },
        { type: 'knight', x: 2, y: 4 },
        { type: 'warrior', x: 1, y: 2 },
        { type: 'warrior', x: 1, y: 3 },
      ],
      cards: [{ card: 'swift-wind', turn: 1 }, { card: 'war-cry', turn: 2 }, { card: 'minor-potion', turn: 4 }],
    },
  },
  arcane: {
    name: 'Legión Sombría',
    army: {
      race: 'undead',
      armor: 'eclipse',
      units: [
        { type: 'guardian', x: 2, y: 2 },
        { type: 'mage', x: 1, y: 3 },
        { type: 'healer', x: 0, y: 2 },
        { type: 'warrior', x: 2, y: 3 },
      ],
      cards: [{ card: 'fallen-legion', turn: 6 }, { card: 'fire-arrow', turn: 3 }],
    },
  },
  volley: {
    name: 'Arqueros de Sylvaran',
    army: {
      race: 'elf',
      armor: 'runic',
      units: [
        { type: 'archer', x: 0, y: 1 },
        { type: 'archer', x: 0, y: 4 },
        { type: 'warrior', x: 2, y: 2 },
        { type: 'warrior', x: 2, y: 3 },
        { type: 'warrior', x: 2, y: 1 },
      ],
      cards: [{ card: 'frost-bind', turn: 1 }, { card: 'meteor', turn: 3 }],
    },
  },
};
