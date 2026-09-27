import { RACES, RARITIES, type CommanderDef } from '@gentium/engine';
import { artUrl } from '../art/assets.ts';
import { spriteFor } from '../art/sprites.ts';

const TRIGGERS = { start: 'Al empezar', hp50: 'Media vida', firstDeath: 'Primera baja' } as const;

/** Ficha de comandante con marco de rareza, retrato, pasiva y habilidad. */
export function commanderElement(def: CommanderDef, size: 'mini' | 'full' = 'mini', owned = true): HTMLElement {
  const el = document.createElement('div');
  el.className = `card commander-card card-${size} r-${def.rarity}${owned ? '' : ' locked'}`;
  el.title = `${def.name}, ${def.title}. ${def.passive.text} ${def.ability.text}`;
  const trigger = typeof def.ability.trigger === 'object' ? `Turno ${def.ability.trigger.turn}` : TRIGGERS[def.ability.trigger];
  const portrait = artUrl(`commanders/${def.id}`);
  el.innerHTML = `
    <div class="card-inner">
      <div class="card-art commander-art">${portrait ? `<img src="${portrait}" alt="">` : ''}</div>
      <div class="card-name">${def.name}</div>
      <div class="card-type">${RARITIES[def.rarity].name} · ${RACES[def.race].name}</div>
      <div class="card-text"><b>${def.passive.name}:</b> ${def.passive.text}</div>
      <div class="card-text ability"><b>${def.ability.name}</b> <span class="trigger">${trigger}</span><br>${def.ability.text}</div>
      ${size === 'full' ? `<div class="card-flavor">${def.lore}</div>` : ''}
      ${owned ? '' : '<div class="lock">🔒 Consíguelo en sobres o campaña</div>'}
    </div>`;
  if (!portrait) {
    const canvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.height = 96 * dpr;
    canvas.getContext('2d')!.drawImage(spriteFor({ type: 'commander', special: { kind: 'commander', id: def.id } }, def.race, def.rarity === 'legendary' ? 'eclipse' : 'royal', 1), 0, 0, 96 * dpr, 96 * dpr);
    el.querySelector('.commander-art')!.append(canvas);
  }
  return el;
}
