import type { Rarity } from './cards.ts';

// Armaduras: puramente cosméticas. Cambian cómo se ve el ejército, nunca sus
// estadísticas; por eso se pueden vender sin convertir el juego en pay-to-win.

export type ArmorId = 'iron' | 'steel' | 'runic' | 'royal' | 'eclipse';

export interface ArmorSet {
  id: ArmorId;
  name: string;
  rarity: Rarity;
  description: string;
}

export const ARMORS: Record<ArmorId, ArmorSet> = {
  iron: { id: 'iron', name: 'Hierro de Campaña', rarity: 'common', description: 'Placas melladas por cien batallas.' },
  steel: { id: 'steel', name: 'Acero Templado', rarity: 'uncommon', description: 'Acero azulado con penacho de guerra.' },
  runic: { id: 'runic', name: 'Plata Rúnica', rarity: 'rare', description: 'Runas que brillan con luz de luna y capa ceremonial.' },
  royal: { id: 'royal', name: 'Oro Real', rarity: 'epic', description: 'Filigrana de oro, gemas y un aura de majestad.' },
  eclipse: { id: 'eclipse', name: 'Armadura del Eclipse', rarity: 'legendary', description: 'Obsidiana viva que arde con llamas de un sol negro.' },
};

export const ARMOR_IDS = Object.keys(ARMORS) as ArmorId[];

export function isArmorId(value: unknown): value is ArmorId {
  return typeof value === 'string' && Object.hasOwn(ARMORS, value);
}
