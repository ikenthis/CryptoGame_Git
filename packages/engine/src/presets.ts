import type { Army } from './army.ts';

/** Ejércitos de la IA para practicar y para el script de balance. */
export const PRESET_ARMIES: Record<string, { name: string; army: Army }> = {
  horde: {
    name: 'Horda',
    army: { units: [0, 1, 2, 3, 4, 5].map((y) => ({ type: 'warrior' as const, x: 2, y })) },
  },
  wall: {
    name: 'Muralla',
    army: {
      units: [
        { type: 'guardian', x: 2, y: 1 },
        { type: 'guardian', x: 2, y: 4 },
        { type: 'archer', x: 0, y: 2 },
        { type: 'archer', x: 0, y: 3 },
      ],
    },
  },
  cavalry: {
    name: 'Caballería',
    army: {
      units: [
        { type: 'knight', x: 2, y: 1 },
        { type: 'knight', x: 2, y: 4 },
        { type: 'warrior', x: 1, y: 2 },
        { type: 'warrior', x: 1, y: 3 },
      ],
    },
  },
  arcane: {
    name: 'Arcano',
    army: {
      units: [
        { type: 'guardian', x: 2, y: 2 },
        { type: 'mage', x: 1, y: 3 },
        { type: 'healer', x: 0, y: 2 },
        { type: 'warrior', x: 2, y: 3 },
      ],
    },
  },
  volley: {
    name: 'Andanada',
    army: {
      units: [
        { type: 'archer', x: 0, y: 1 },
        { type: 'archer', x: 0, y: 4 },
        { type: 'warrior', x: 2, y: 2 },
        { type: 'warrior', x: 2, y: 3 },
        { type: 'warrior', x: 2, y: 1 },
      ],
    },
  },
};
