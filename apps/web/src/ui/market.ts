import {
  CARDS, CARD_IDS, CRAFT_COST, ESSENCE_VALUE, PACKS, RARITIES, RESOURCES,
  buyOffer, canAfford, craft, distill, merchantOffers, openPack, rewardSummary, transmute,
  type CardId, type PackKind, type Profile, type Rarity, type Resource,
} from '@gentium/engine';
import type { LootView } from './modal.ts';

export interface MarketCtx {
  profile: Profile;
  setProfile: (p: Profile) => void;
  rng: () => () => number;
  day: string;
  onLoot: (view: LootView) => void;
  onError: (message: string) => void;
}

const altar: CardId[] = [];

const cost = (c: Partial<Record<Resource, number>>) =>
  Object.entries(c).map(([r, n]) => `${RESOURCES[r as Resource].icon} ${n}`).join(' + ');

/** Mercado Negro: sobres, altar de transmutación, destilado, mercader y mercado entre jugadores. */
export function renderMarket(container: HTMLElement, ctx: MarketCtx): void {
  container.replaceChildren(packsSection(ctx), altarSection(ctx), forgeSection(ctx), merchantSection(ctx), p2pSection());
}

function section(title: string, text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'box market-section';
  el.innerHTML = `<h2>${title}</h2><p class="muted">${text}</p>`;
  return el;
}

function act(ctx: MarketCtx, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    ctx.onError((err as Error).message);
  }
}

function packsSection(ctx: MarketCtx): HTMLElement {
  const el = section('Sobres', 'Se abren solo con Fichas Extrañas, que se ganan en campaña e incursiones. No se venden por dinero.');
  const grid = document.createElement('div');
  grid.className = 'packs';
  for (const pack of Object.values(PACKS)) {
    const tile = document.createElement('div');
    tile.className = `pack pack-${pack.kind}`;
    const odds = (Object.entries(pack.odds) as Array<[Rarity, number]>)
      .map(([r, n]) => `<span class="odd r-${r}">${RARITIES[r].name} ${n}%</span>`).join('');
    tile.innerHTML = `<div class="pack-art">${pack.kind === 'war' ? '🂠' : '♛'}</div>
      <strong>${pack.name}</strong><span class="muted">${pack.text}</span><div class="odds">${odds}</div>`;
    const b = document.createElement('button');
    b.className = 'btn primary small';
    b.textContent = `Abrir · ${cost(pack.cost)}`;
    b.disabled = !canAfford(ctx.profile, pack.cost);
    b.onclick = () => act(ctx, () => {
      const r = openPack(ctx.profile, pack.kind as PackKind, ctx.rng());
      ctx.setProfile(r.profile);
      ctx.onLoot({ title: pack.name, subtitle: '¡Nuevas incorporaciones a tu colección!', cards: r.cards, commanders: r.commanders });
    });
    tile.append(b);
    grid.append(tile);
  }
  el.append(grid);
  return el;
}

function altarSection(ctx: MarketCtx): HTMLElement {
  const el = section('Altar de Transmutación', 'Ofrece 3 cartas de la misma rareza y recibe una al azar de la rareza siguiente. Toca cartas de tu colección para colocarlas.');
  // El altar solo guarda cartas que todavía tienes.
  const owned = (id: CardId) => (ctx.profile.cards[id] ?? 0) - altar.filter((a) => a === id).length;
  const slots = document.createElement('div');
  slots.className = 'altar';
  for (let i = 0; i < 3; i++) {
    const id = altar[i];
    const slot = document.createElement('button');
    slot.className = `altar-slot${id ? ` r-${CARDS[id].rarity}` : ''}`;
    slot.textContent = id ? CARDS[id].name : 'Vacío';
    slot.onclick = () => { if (id) { altar.splice(i, 1); renderMarket(el.parentElement!, ctx); } };
    slots.append(slot);
  }
  const go = document.createElement('button');
  go.className = 'btn primary small';
  go.textContent = 'Transmutar';
  go.disabled = altar.length !== 3;
  go.onclick = () => act(ctx, () => {
    const r = transmute(ctx.profile, [...altar], ctx.rng());
    altar.length = 0;
    ctx.setProfile(r.profile);
    ctx.onLoot({ title: 'Transmutación completada', subtitle: 'El altar arde y algo nuevo surge de las cenizas.', cards: [r.card] });
  });
  slots.append(go);
  el.append(slots);

  const list = document.createElement('div');
  list.className = 'chips';
  const rarity = altar[0] ? CARDS[altar[0]].rarity : null;
  for (const id of CARD_IDS) {
    const n = owned(id);
    if (n <= 0 || CARDS[id].rarity === 'legendary' || (rarity && CARDS[id].rarity !== rarity)) continue;
    const chip = document.createElement('button');
    chip.className = `chip r-${CARDS[id].rarity}`;
    chip.textContent = `${CARDS[id].name} ×${n}`;
    chip.disabled = altar.length >= 3;
    chip.onclick = () => { altar.push(id); renderMarket(el.parentElement!, ctx); };
    list.append(chip);
  }
  if (!list.children.length) list.innerHTML = '<span class="muted">No tienes cartas disponibles para esta rareza.</span>';
  el.append(list);
  return el;
}

function forgeSection(ctx: MarketCtx): HTMLElement {
  const el = section('Destilería y Forja', 'Destila copias repetidas en Esencia (✦) y usa la Esencia para fabricar la carta exacta que buscas.');
  const table = document.createElement('div');
  table.className = 'forge';
  for (const id of CARD_IDS) {
    const card = CARDS[id];
    const n = ctx.profile.cards[id] ?? 0;
    const row = document.createElement('div');
    row.className = 'forge-row';
    row.innerHTML = `<span class="r-text r-${card.rarity}">${card.name}</span><span class="muted">×${n}</span>`;
    const d = document.createElement('button');
    d.className = 'btn ghost small';
    d.textContent = `Destilar +${ESSENCE_VALUE[card.rarity]}✦`;
    d.disabled = n < 2;
    d.onclick = () => act(ctx, () => ctx.setProfile(distill(ctx.profile, id)));
    const f = document.createElement('button');
    f.className = 'btn ghost small';
    f.textContent = `Fabricar ${CRAFT_COST[card.rarity]}✦`;
    f.disabled = ctx.profile.resources.essence < CRAFT_COST[card.rarity];
    f.onclick = () => act(ctx, () => {
      ctx.setProfile(craft(ctx.profile, id));
      ctx.onLoot({ title: 'Carta forjada', cards: [id] });
    });
    row.append(d, f);
    table.append(row);
  }
  el.append(table);
  return el;
}

function merchantSection(ctx: MarketCtx): HTMLElement {
  const el = section('El Mercader Sin Nombre', 'Cambia materiales de tus batallas por fichas, provisiones o piezas raras. Sus ofertas cambian cada día.');
  const bought = ctx.profile.merchant.day === ctx.day ? ctx.profile.merchant.bought : [];
  const list = document.createElement('div');
  list.className = 'offers';
  for (const offer of merchantOffers(ctx.day)) {
    const row = document.createElement('div');
    row.className = 'offer';
    row.innerHTML = `<strong>${offer.name}</strong><span class="muted">Das ${cost(offer.give)} · Recibes ${rewardSummary(offer.get).join(', ')}</span>`;
    const b = document.createElement('button');
    b.className = 'btn small';
    const sold = bought.includes(offer.id);
    b.textContent = sold ? 'Vendido' : 'Comprar';
    b.disabled = sold || !canAfford(ctx.profile, offer.give);
    b.onclick = () => act(ctx, () => {
      ctx.setProfile(buyOffer(ctx.profile, ctx.day, offer.id));
      ctx.onLoot({ title: 'Trato cerrado', subtitle: 'El mercader sonríe bajo la capucha.', lines: rewardSummary(offer.get), cards: offer.get.cards, commanders: offer.get.commanders });
    });
    row.append(b);
    list.append(row);
  }
  el.append(list);
  return el;
}

function p2pSection(): HTMLElement {
  return section(
    'Mercado entre jugadores · próximamente',
    'Compra y vende cartas, comandantes y materiales con otros jugadores usando Oro de guerra. Se activa cuando la colección se guarde en el servidor, para que nadie pueda duplicar objetos. Las Fichas Extrañas y los sobres no se comercian.',
  );
}
