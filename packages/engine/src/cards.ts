import type { Race } from './races.ts';
import type { UnitType } from './rules.ts';

// Cartas de acción: se programan para un turno y se ejecutan solas al empezar
// ese turno. La rareza indica lo espectacular o específica que es una carta;
// su fuerza la equilibra el coste de energía, no la rareza.

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export const RARITIES: Record<Rarity, { name: string; order: number }> = {
  common: { name: 'Común', order: 0 },
  uncommon: { name: 'Poco común', order: 1 },
  rare: { name: 'Rara', order: 2 },
  epic: { name: 'Épica', order: 3 },
  legendary: { name: 'Legendaria', order: 4 },
};

export type TargetRule = 'weakest' | 'strongest' | 'frontline' | 'cluster';

export type CardEffect =
  | { kind: 'damage'; amount: number; target: TargetRule; splash?: number; ignoresArmor?: boolean }
  | { kind: 'chain'; amounts: number[] }
  | { kind: 'volley'; amount: number }
  | { kind: 'heal'; amount: number; target: 'most-wounded' | 'all' }
  | { kind: 'buff'; stat: 'attack' | 'armor' | 'speed'; amount: number; duration: number }
  | { kind: 'stun'; duration: number; target: TargetRule }
  | { kind: 'summon'; unit: UnitType }
  | { kind: 'revive'; which: 'best' | 'all'; hp: 'half' | number };

export type CardId =
  | 'fire-arrow' | 'minor-potion' | 'war-cry'
  | 'stone-skin' | 'swift-wind' | 'frost-bind'
  | 'meteor' | 'reinforcements' | 'healing-light'
  | 'chain-lightning' | 'resurrection'
  | 'aurelia-intervention' | 'sylvaran-storm' | 'ash-fury' | 'fallen-legion' | 'ancestral-golem';

export interface Card {
  id: CardId;
  name: string;
  rarity: Rarity;
  cost: number;
  /** null = carta neutral, disponible para todas las razas. */
  race: Race | null;
  text: string;
  flavor: string;
  effects: CardEffect[];
}

const card = (c: Card) => c;

export const CARDS: Record<CardId, Card> = {
  'fire-arrow': card({
    id: 'fire-arrow', name: 'Flecha Ígnea', rarity: 'common', cost: 1, race: null,
    text: '3 de daño al enemigo con menos vida.',
    flavor: 'Una sola flecha puede cambiar una guerra.',
    effects: [{ kind: 'damage', amount: 3, target: 'weakest' }],
  }),
  'minor-potion': card({
    id: 'minor-potion', name: 'Poción Menor', rarity: 'common', cost: 1, race: null,
    text: 'Cura 4 al aliado más herido.',
    flavor: 'Sabe a hierbas y a hierro.',
    effects: [{ kind: 'heal', amount: 4, target: 'most-wounded' }],
  }),
  'war-cry': card({
    id: 'war-cry', name: 'Grito de Guerra', rarity: 'common', cost: 2, race: null,
    text: 'Aliados +1 de ataque durante 2 turnos.',
    flavor: '¡Por el estandarte!',
    effects: [{ kind: 'buff', stat: 'attack', amount: 1, duration: 2 }],
  }),
  'stone-skin': card({
    id: 'stone-skin', name: 'Piel de Piedra', rarity: 'uncommon', cost: 2, race: null,
    text: 'Aliados +1 de armadura durante 3 turnos.',
    flavor: 'La montaña presta su dureza a quien la honra.',
    effects: [{ kind: 'buff', stat: 'armor', amount: 1, duration: 3 }],
  }),
  'swift-wind': card({
    id: 'swift-wind', name: 'Viento Veloz', rarity: 'uncommon', cost: 2, race: null,
    text: 'Aliados +1 de velocidad durante 2 turnos.',
    flavor: 'El viento no espera a nadie.',
    effects: [{ kind: 'buff', stat: 'speed', amount: 1, duration: 2 }],
  }),
  'frost-bind': card({
    id: 'frost-bind', name: 'Cadenas de Escarcha', rarity: 'uncommon', cost: 2, race: null,
    text: 'Congela al enemigo con más vida: pierde 2 turnos.',
    flavor: 'El hielo recuerda cada paso.',
    effects: [{ kind: 'stun', duration: 2, target: 'strongest' }],
  }),
  meteor: card({
    id: 'meteor', name: 'Meteoro', rarity: 'rare', cost: 3, race: null,
    text: '5 de daño al centro del grupo enemigo y 2 a los adyacentes. Ignora armadura.',
    flavor: 'Las estrellas también eligen bando.',
    effects: [{ kind: 'damage', amount: 5, target: 'cluster', splash: 2, ignoresArmor: true }],
  }),
  reinforcements: card({
    id: 'reinforcements', name: 'Refuerzos', rarity: 'rare', cost: 3, race: null,
    text: 'Invoca un Guerrero en tu retaguardia.',
    flavor: 'Siempre llega uno más.',
    effects: [{ kind: 'summon', unit: 'warrior' }],
  }),
  'healing-light': card({
    id: 'healing-light', name: 'Luz Sanadora', rarity: 'rare', cost: 3, race: null,
    text: 'Cura 3 a todos los aliados.',
    flavor: 'Un amanecer en mitad de la batalla.',
    effects: [{ kind: 'heal', amount: 3, target: 'all' }],
  }),
  'chain-lightning': card({
    id: 'chain-lightning', name: 'Cadena de Rayos', rarity: 'epic', cost: 4, race: null,
    text: '4 de daño al enemigo más adelantado; salta a otros dos (3 y 2).',
    flavor: 'El trueno no pide permiso.',
    effects: [{ kind: 'chain', amounts: [4, 3, 2] }],
  }),
  resurrection: card({
    id: 'resurrection', name: 'Resurrección', rarity: 'epic', cost: 4, race: null,
    text: 'Revive a tu unidad caída más valiosa con la mitad de su vida.',
    flavor: 'Todavía no era su hora.',
    effects: [{ kind: 'revive', which: 'best', hp: 'half' }],
  }),
  'aurelia-intervention': card({
    id: 'aurelia-intervention', name: 'Intervención de Aurelia', rarity: 'legendary', cost: 5, race: 'human',
    text: 'Cura por completo a todos los aliados y les da +1 de armadura durante 2 turnos.',
    flavor: 'Cuando la reina alza su espada, el reino entero se levanta.',
    effects: [{ kind: 'heal', amount: 99, target: 'all' }, { kind: 'buff', stat: 'armor', amount: 1, duration: 2 }],
  }),
  'sylvaran-storm': card({
    id: 'sylvaran-storm', name: 'Tormenta de Sylvaran', rarity: 'legendary', cost: 5, race: 'elf',
    text: '3 de daño a todos los enemigos.',
    flavor: 'Mil arcos, un solo suspiro.',
    effects: [{ kind: 'volley', amount: 3 }],
  }),
  'ash-fury': card({
    id: 'ash-fury', name: 'Furia de Ceniza', rarity: 'legendary', cost: 5, race: 'orc',
    text: 'Aliados +3 de ataque y +1 de velocidad durante 2 turnos.',
    flavor: 'Los tambores del caudillo no se oyen: se sienten.',
    effects: [{ kind: 'buff', stat: 'attack', amount: 3, duration: 2 }, { kind: 'buff', stat: 'speed', amount: 1, duration: 2 }],
  }),
  'fallen-legion': card({
    id: 'fallen-legion', name: 'Legión de los Caídos', rarity: 'legendary', cost: 5, race: 'undead',
    text: 'Revive a todos tus aliados caídos con 4 de vida.',
    flavor: 'La muerte es solo un cambio de bando… o no.',
    effects: [{ kind: 'revive', which: 'all', hp: 4 }],
  }),
  'ancestral-golem': card({
    id: 'ancestral-golem', name: 'Gólem Ancestral', rarity: 'legendary', cost: 5, race: 'dwarf',
    text: 'Invoca un Gólem Ancestral (24 vida, 4 ataque, armadura 3).',
    flavor: 'Forjado cuando las montañas aún eran jóvenes.',
    effects: [{ kind: 'summon', unit: 'golem' }],
  }),
};

export const CARD_IDS = Object.keys(CARDS) as CardId[];

export function isCardId(value: unknown): value is CardId {
  return typeof value === 'string' && Object.hasOwn(CARDS, value);
}

/** Cartas que puede usar una raza: las neutrales y su legendaria. */
export function cardsForRace(race: Race): Card[] {
  return CARD_IDS.map((id) => CARDS[id])
    .filter((c) => c.race === null || c.race === race)
    .sort((a, b) => RARITIES[a.rarity].order - RARITIES[b.rarity].order || a.cost - b.cost);
}
