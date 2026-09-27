import type { ArmorId, Race, Rarity } from '@gentium/engine';

// Paletas del arte procedural. Todo el aspecto visual sale de aquí: cambiar un
// color aquí cambia sprites, cartas y efectos a la vez.

export interface RaceArt {
  skin: string;
  skinShade: string;
  cloth: string;
  clothDark: string;
  accent: string;
  /** Color de la magia de la raza (orbes, runas, auras). */
  magic: string;
  hair: string;
}

export const RACE_ART: Record<Race, RaceArt> = {
  human: { skin: '#e9c29b', skinShade: '#b98a64', cloth: '#1f4fb4', clothDark: '#122c66', accent: '#f4d06f', magic: '#8fd3ff', hair: '#5a3b22' },
  elf: { skin: '#f3dcc4', skinShade: '#c7a98c', cloth: '#1f7a4c', clothDark: '#0f4028', accent: '#d9f5b0', magic: '#7dffb5', hair: '#f1e7b5' },
  orc: { skin: '#6f9a3c', skinShade: '#44641f', cloth: '#9e1f1f', clothDark: '#4f0d0d', accent: '#1d1d1d', magic: '#ff7a2f', hair: '#1a1a1a' },
  undead: { skin: '#d9d4bf', skinShade: '#8f8a76', cloth: '#4b2a73', clothDark: '#24133b', accent: '#5ff5d6', magic: '#5ff5d6', hair: '#3b3b3b' },
  dwarf: { skin: '#e3a882', skinShade: '#a86f4d', cloth: '#b5621a', clothDark: '#5e2f09', accent: '#ffd27a', magic: '#ffb347', hair: '#c4521b' },
};

export interface ArmorArt {
  light: string;
  base: string;
  dark: string;
  trim: string;
  /** Color de runas/brillos; null = sin runas. */
  glow: string | null;
  cape: boolean;
  plume: boolean;
  gems: boolean;
  /** Intensidad del aura (0 = ninguna). */
  aura: number;
  embers: boolean;
}

export const ARMOR_ART: Record<ArmorId, ArmorArt> = {
  iron: { light: '#a4a8ad', base: '#6b6f74', dark: '#34373b', trim: '#7b5a3a', glow: null, cape: false, plume: false, gems: false, aura: 0, embers: false },
  steel: { light: '#e3edf7', base: '#8fa3b8', dark: '#3f4f60', trim: '#c9d3dc', glow: null, cape: false, plume: true, gems: false, aura: 0, embers: false },
  runic: { light: '#ffffff', base: '#b9c3cf', dark: '#5d6875', trim: '#dfe7ef', glow: '#6fe3ff', cape: true, plume: true, gems: false, aura: 0.35, embers: false },
  royal: { light: '#fff3b0', base: '#d4a73a', dark: '#6e4a0e', trim: '#fff4c2', glow: '#ffe28a', cape: true, plume: true, gems: true, aura: 0.55, embers: false },
  eclipse: { light: '#6b5a82', base: '#231b2e', dark: '#07050a', trim: '#ff8a2a', glow: '#ff6a1a', cape: true, plume: false, gems: true, aura: 0.9, embers: true },
};

export const RARITY_COLORS: Record<Rarity, { main: string; light: string; glow: string }> = {
  common: { main: '#9aa3ad', light: '#dfe5ea', glow: 'rgba(200,210,220,0.25)' },
  uncommon: { main: '#3fbf6a', light: '#b6f5c9', glow: 'rgba(63,191,106,0.35)' },
  rare: { main: '#3d8bff', light: '#b8d6ff', glow: 'rgba(61,139,255,0.45)' },
  epic: { main: '#a84dff', light: '#e2c2ff', glow: 'rgba(168,77,255,0.5)' },
  legendary: { main: '#ff9a1f', light: '#ffe1a3', glow: 'rgba(255,154,31,0.6)' },
};

export const TEAM_COLORS = { ally: '#46c8ff', enemy: '#ff4a4a' } as const;

export const STATUS_COLORS = { attack: '#ff5a36', armor: '#9cc9ff', speed: '#6dff9e', stunned: '#a8e8ff' } as const;
