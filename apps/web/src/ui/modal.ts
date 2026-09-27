import { CARDS, COMMANDERS, type CardId, type CommanderId } from '@gentium/engine';
import { cardElement } from './card.ts';
import { commanderElement } from './commander.ts';

export interface LootView {
  title: string;
  subtitle?: string;
  lines?: string[];
  cards?: CardId[];
  commanders?: CommanderId[];
}

/** Ventana de botín: las cartas aparecen boca abajo y se revelan una a una. */
export function showLoot(view: LootView, onClose?: () => void): void {
  document.querySelector('.loot')?.remove();
  const root = document.createElement('div');
  root.className = 'loot';
  root.setAttribute('role', 'dialog');
  root.innerHTML = `
    <div class="loot-box">
      <h2>${view.title}</h2>
      ${view.subtitle ? `<p class="loot-sub">${view.subtitle}</p>` : ''}
      ${view.lines?.length ? `<ul class="loot-lines">${view.lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : ''}
      <div class="loot-cards"></div>
      <button class="btn primary" data-close>Continuar</button>
    </div>`;
  const grid = root.querySelector('.loot-cards')!;
  const items = [
    ...(view.commanders ?? []).map((id) => commanderElement(COMMANDERS[id], 'mini')),
    ...(view.cards ?? []).map((id) => cardElement(CARDS[id], 'mini')),
  ];
  items.forEach((el, i) => {
    const flip = document.createElement('div');
    flip.className = 'flip';
    flip.style.animationDelay = `${0.25 + i * 0.35}s`;
    flip.append(el);
    grid.append(flip);
  });
  root.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => {
    root.remove();
    onClose?.();
  };
  document.body.append(root);
}
