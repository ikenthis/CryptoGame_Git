import {
  CARDS, CARD_IDS, COMMANDERS, COMMANDER_IDS, CRAFT_COST, ESSENCE_VALUE, MARKET_FEE_BPS, PACKS, RARITIES, RESOURCES, RESOURCE_IDS,
  canAfford, merchantOffers, rewardSummary,
  type CardId, type MarketItem, type PackKind, type Profile, type Rarity, type Resource,
} from '@gentium/engine';
import type { Action, ActionResult, Listing, market as Market } from '../state/backend.ts';
import type { LootView } from './modal.ts';

export interface MarketCtx {
  profile: Profile;
  /** Ejecuta la acción (en el servidor si hay sesión) y actualiza el perfil. */
  perform: (action: Action) => Promise<ActionResult>;
  day: string;
  onLoot: (view: LootView) => void;
  onError: (message: string) => void;
  p2p: {
    online: boolean;
    verified: boolean;
    me: string;
    listings: Listing[];
    market: typeof Market;
    reload: () => Promise<void>;
  };
}

const altar: CardId[] = [];

const cost = (c: Partial<Record<Resource, number>>) =>
  Object.entries(c).map(([r, n]) => `${RESOURCES[r as Resource].icon} ${n}`).join(' + ');

/** Mercado Negro: sobres, altar de transmutación, destilado, mercader y mercado entre jugadores. */
export function renderMarket(container: HTMLElement, ctx: MarketCtx): void {
  container.replaceChildren(packsSection(ctx), altarSection(ctx), forgeSection(ctx), merchantSection(ctx), p2pSection(ctx));
}

function section(title: string, text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'box market-section';
  el.innerHTML = `<h2>${title}</h2><p class="muted">${text}</p>`;
  return el;
}

let busy = false;
/** Ejecuta una acción asíncrona evitando dobles clics; los errores se muestran al jugador. */
async function act(ctx: MarketCtx, fn: () => Promise<void>): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    await fn();
  } catch (err) {
    ctx.onError((err as Error).message);
  } finally {
    busy = false;
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
    b.onclick = () => act(ctx, async () => {
      const r = await ctx.perform({ type: 'pack', kind: pack.kind as PackKind });
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
  go.onclick = () => act(ctx, async () => {
    const r = await ctx.perform({ type: 'transmute', cards: [...altar] });
    altar.length = 0;
    ctx.onLoot({ title: 'Transmutación completada', subtitle: 'El altar arde y algo nuevo surge de las cenizas.', cards: r.card ? [r.card] : [] });
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
    d.onclick = () => act(ctx, async () => { await ctx.perform({ type: 'distill', card: id }); });
    const f = document.createElement('button');
    f.className = 'btn ghost small';
    f.textContent = `Fabricar ${CRAFT_COST[card.rarity]}✦`;
    f.disabled = ctx.profile.resources.essence < CRAFT_COST[card.rarity];
    f.onclick = () => act(ctx, async () => {
      await ctx.perform({ type: 'craft', card: id });
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
    b.onclick = () => act(ctx, async () => {
      await ctx.perform({ type: 'merchant', offer: offer.id });
      ctx.onLoot({ title: 'Trato cerrado', subtitle: 'El mercader sonríe bajo la capucha.', lines: rewardSummary(offer.get), cards: offer.get.cards, commanders: offer.get.commanders });
    });
    row.append(b);
    list.append(row);
  }
  el.append(list);
  return el;
}

const TRADABLE = RESOURCE_IDS.filter((r) => RESOURCES[r].tradable && r !== 'gold');
const fee = (price: number) => Math.floor((price * MARKET_FEE_BPS) / 10_000);

/** Objetos que el jugador puede poner a la venta, con su etiqueta. */
function sellable(profile: Profile): Array<{ item: MarketItem; label: string }> {
  const out: Array<{ item: MarketItem; label: string }> = [];
  for (const id of CARD_IDS) if ((profile.cards[id] ?? 0) > 0) out.push({ item: { kind: 'card', id }, label: `🂠 ${CARDS[id].name} ×${profile.cards[id]}` });
  for (const id of COMMANDER_IDS) if ((profile.commanders[id] ?? 0) > 0) out.push({ item: { kind: 'commander', id }, label: `♛ ${COMMANDERS[id].name} ×${profile.commanders[id]}` });
  for (const id of TRADABLE) if (profile.resources[id] >= 5) out.push({ item: { kind: 'resource', id, qty: 5 }, label: `${RESOURCES[id].icon} 5 de ${RESOURCES[id].name} (tienes ${profile.resources[id]})` });
  return out;
}

function p2pSection(ctx: MarketCtx): HTMLElement {
  const { p2p } = ctx;
  const el = section(
    'Mercado entre jugadores',
    `Compra y vende cartas, comandantes y materiales con otros jugadores usando Oro de guerra (${RESOURCES.gold.icon}). El objeto queda en custodia hasta que se vende o lo retiras. Comisión: ${MARKET_FEE_BPS / 100} %. Las Fichas Extrañas y los sobres no se comercian.`,
  );
  if (!p2p.online) {
    el.insertAdjacentHTML('beforeend', '<p class="muted">Disponible en el juego completo (con servidor). En esta demo tu colección solo vive en tu navegador.</p>');
    return el;
  }

  const listBox = document.createElement('div');
  listBox.className = 'offers';
  if (!p2p.listings.length) listBox.innerHTML = '<span class="muted">Aún no hay nada a la venta. ¡Sé el primero!</span>';
  for (const l of p2p.listings) {
    const row = document.createElement('div');
    row.className = 'offer';
    const who = document.createElement('span');
    who.className = 'muted';
    who.textContent = `Vende ${l.sellerName}`;
    const title = document.createElement('strong');
    title.textContent = `${l.label} · ${RESOURCES.gold.icon} ${l.price}`;
    const b = document.createElement('button');
    b.className = 'btn small';
    if (l.seller === p2p.me) {
      b.textContent = 'Retirar';
      b.onclick = () => act(ctx, async () => { await p2p.market.cancel(l.id); await p2p.reload(); });
    } else {
      b.textContent = 'Comprar';
      b.disabled = !p2p.verified || ctx.profile.resources.gold < l.price;
      b.onclick = () => act(ctx, async () => {
        const bought = await p2p.market.buy(l.id);
        await p2p.reload();
        const it = bought.item;
        ctx.onLoot({
          title: 'Compra completada', subtitle: `${bought.label} por ${bought.price} de oro.`,
          cards: it.kind === 'card' ? [it.id] : [], commanders: it.kind === 'commander' ? [it.id] : [],
        });
      });
    }
    row.append(title, who, b);
    listBox.append(row);
  }
  el.append(listBox);

  if (!p2p.verified) {
    el.insertAdjacentHTML('beforeend', '<p class="muted">Para comprar y vender, abre el juego desde Telegram: así cada cuenta es una persona real y nadie pasa objetos entre multicuentas.</p>');
    return el;
  }

  const form = document.createElement('div');
  form.className = 'sell-form';
  const select = document.createElement('select');
  const options = sellable(ctx.profile);
  options.forEach((o, i) => select.append(new Option(o.label, String(i))));
  const price = document.createElement('input');
  price.type = 'number';
  price.min = '1';
  price.step = '1';
  price.placeholder = 'Precio en oro';
  price.inputMode = 'numeric';
  const hint = document.createElement('span');
  hint.className = 'muted';
  price.oninput = () => {
    const n = Number(price.value);
    hint.textContent = Number.isInteger(n) && n > 0 ? `Recibirás ${n - fee(n)} de oro` : '';
  };
  const sell = document.createElement('button');
  sell.className = 'btn primary small';
  sell.textContent = 'Poner a la venta';
  sell.disabled = !options.length;
  sell.onclick = () => act(ctx, async () => {
    const chosen = options[Number(select.value)];
    const n = Number(price.value);
    if (!chosen || !Number.isInteger(n) || n < 1) throw new Error('Elige un objeto y un precio entero.');
    await p2p.market.sell(chosen.item, n);
    await p2p.reload();
  });
  form.append(select, price, sell, hint);
  el.append(form);
  return el;
}
