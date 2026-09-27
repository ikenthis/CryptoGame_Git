import { RACES, RARITIES, type Card } from '@gentium/engine';
import { artUrl } from '../art/assets.ts';
import { CARD_ART, ENERGY_ICON } from '../art/icons.ts';

/** Carta coleccionable con marco según su rareza. `size` controla el tamaño vía CSS. */
export function cardElement(card: Card, size: 'mini' | 'full' | 'hero' = 'full'): HTMLElement {
  const el = document.createElement('div');
  const illustration = artUrl(`cards/${card.id}`);
  el.className = `card card-${size} r-${card.rarity}${illustration ? ' illustrated' : ''}`;
  el.title = `${card.name} (${RARITIES[card.rarity].name}): ${card.text}`;
  el.innerHTML = `
    <div class="card-inner">
      <div class="card-cost">${ENERGY_ICON}<span>${card.cost}</span></div>
      <div class="card-art">${illustration ? `<img src="${illustration}" alt="" loading="lazy" decoding="async">` : CARD_ART[card.id]}</div>
      <div class="card-name">${card.name}</div>
      <div class="card-type">${RARITIES[card.rarity].name}${card.race ? ` · ${RACES[card.race].name}` : ''}</div>
      <div class="card-text">${card.text}</div>
      ${size === 'mini' ? '' : `<div class="card-flavor">${card.flavor}</div>`}
    </div>`;
  return el;
}
