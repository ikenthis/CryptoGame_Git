import {
  ARMORS, ARMOR_IDS, BUDGET, CARDS, CARD_TURN_MAX, DEPLOY_COLUMNS, ENERGY, MAX_CARDS, MAX_LEGENDARY_CARDS, MAX_UNITS,
  PRESET_ARMIES, RACES, RACE_IDS, RARITIES, UNITS, UNIT_TYPES,
  armyCost, cardEnergy, cardsForRace, simulate, statsFor, validateArmy,
  type ArmorId, type Army, type BattleResult, type Card, type CardPlay, type Placement, type Race, type Side, type UnitType,
} from '@bastion/engine';
import { artUrl, loadArt } from './art/assets.ts';
import { RACE_EMBLEM } from './art/icons.ts';
import { getSprite } from './art/sprites.ts';
import { sound } from './audio/sound.ts';
import { initTelegram, type TelegramWebApp } from './platform/telegram.ts';
import { RARITY_COLORS } from './art/theme.ts';
import { Scene, type Look } from './scene/scene.ts';
import { cardElement } from './ui/card.ts';
import { Tutorial, tutorialSeen } from './ui/tutorial.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- Estado ----------

let race: Race = 'human';
let armor: ArmorId = 'royal';
let placements: Placement[] = [];
let deck: CardPlay[] = [];
let selected: UnitType = 'warrior';
let battling = false;
const SPEEDS = [1, 2, 4];
/** Presente solo cuando el juego se abre como Mini App de Telegram. */
let tg: TelegramWebApp | null = null;
/** Sesión verificada por el servidor (hoy, vía Telegram). */
let session: { token: string; playerId: string; name: string } | null = null;
let speedIndex = 0;

const scene = new Scene($<HTMLCanvasElement>('board'));
const statusEl = $('status');
const opponentSelect = $<HTMLSelectElement>('opponent');

const currentArmy = (): Army => ({ race, armor, units: placements, cards: deck });
const look = (): Look => ({ race, armor });

function setStatus(text: string, tone: '' | 'win' | 'loss' = ''): void {
  statusEl.textContent = text;
  statusEl.className = `status ${tone}`;
}

// ---------- Tablero ----------

const canvas = scene.canvas;
canvas.addEventListener('mousemove', (ev) => {
  scene.hover = battling ? null : scene.cellAt(ev.clientX, ev.clientY);
  canvas.style.cursor = scene.hover && scene.hover.x < DEPLOY_COLUMNS ? 'pointer' : 'default';
});
canvas.addEventListener('mouseleave', () => { scene.hover = null; });
canvas.addEventListener('click', (ev) => {
  if (battling) return;
  const cell = scene.cellAt(ev.clientX, ev.clientY);
  if (!cell) return;
  if (cell.x >= DEPLOY_COLUMNS) return setStatus('Solo puedes desplegar en tu zona (columnas iluminadas).');
  const existing = placements.findIndex((p) => p.x === cell.x && p.y === cell.y);
  if (existing >= 0) {
    placements.splice(existing, 1);
    sound.play('remove');
  } else if (placements.length >= MAX_UNITS) return setStatus(`Máximo ${MAX_UNITS} unidades.`);
  else if (armyCost({ units: placements }) + UNITS[selected].cost > BUDGET) return setStatus('No te alcanza el oro.');
  else {
    placements.push({ type: selected, x: cell.x, y: cell.y });
    sound.play('place');
  }
  setStatus('Clic sobre una unidad para retirarla.');
  refresh();
});

function refreshScene(): void {
  if (battling) return;
  const preset = PRESET_ARMIES[opponentSelect.value];
  scene.ghost = { type: selected, look: look() };
  scene.setBuild(placements, look(), preset && {
    units: preset.army.units, look: { race: preset.army.race, armor: preset.army.armor ?? 'iron' },
  });
}

// ---------- Razas ----------

/** Retrato ilustrado de la raza si existe; si no, su emblema vectorial. */
function raceBadge(id: Race): string {
  const portrait = artUrl(`races/${id}`);
  return portrait ? `<span class="emblem portrait"><img src="${portrait}" alt=""></span>` : `<span class="emblem">${RACE_EMBLEM[id]}</span>`;
}

function renderRaces(): void {
  $('races').replaceChildren(...RACE_IDS.map((id) => {
    const b = document.createElement('button');
    b.className = `race race-${id}${id === race ? ' active' : ''}`;
    b.innerHTML = `${raceBadge(id)}<span><strong>${RACES[id].name}</strong><small>${RACES[id].realm}</small></span>`;
    b.onclick = () => {
      if (battling) return;
      race = id;
      deck = deck.filter((c) => CARDS[c.card].race === null || CARDS[c.card].race === race);
      renderAll();
    };
    return b;
  }));
  const info = RACES[race];
  $('race-trait').innerHTML = `${raceBadge(race)}<div><strong>${info.realm}</strong> · <em>${info.trait}</em><br>${info.description}</div>`;
}

// ---------- Unidades ----------

function spriteCanvas(type: UnitType, r: Race, a: ArmorId, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = c.height = size * dpr;
  c.style.width = c.style.height = `${size}px`;
  c.getContext('2d')!.drawImage(getSprite(type, r, a, 1), 0, 0, size * dpr, size * dpr);
  return c;
}

function renderPalette(): void {
  $('palette').replaceChildren(...UNIT_TYPES.map((type) => {
    const base = UNITS[type];
    const s = statsFor(type, race);
    const stat = (icon: string, v: number, b: number) =>
      `<span class="${v > b ? 'up' : v < b ? 'down' : ''}">${icon}${v}</span>`;
    const b = document.createElement('button');
    b.className = `unit${type === selected ? ' selected' : ''}`;
    b.title = base.description;
    b.append(spriteCanvas(type, race, armor, 58));
    const info = document.createElement('span');
    info.innerHTML = `<span class="name">${base.name}</span>
      <span class="stats">${stat('❤', s.hp, base.hp)} ${stat('⚔', s.attack, base.attack)} ${stat('🎯', s.range, base.range)} ${stat('👟', s.speed, base.speed)}${s.armor ? ` ${stat('🛡', s.armor, base.armor)}` : ''}${s.heal ? ` ${stat('✚', s.heal, base.heal)}` : ''}</span>
      <span class="desc">${base.description}</span>`;
    const cost = document.createElement('span');
    cost.className = 'cost';
    cost.textContent = String(base.cost);
    b.append(info, cost);
    b.onclick = () => { selected = type; renderPalette(); refreshScene(); setStatus(base.description); };
    return b;
  }));
}

// ---------- Cartas ----------

function cardBlocker(card: Card): string | null {
  if (deck.some((c) => c.card === card.id)) return 'Ya está en tu mazo.';
  if (deck.length >= MAX_CARDS) return `Máximo ${MAX_CARDS} cartas.`;
  if (card.rarity === 'legendary' && deck.filter((c) => CARDS[c.card].rarity === 'legendary').length >= MAX_LEGENDARY_CARDS) {
    return 'Solo una legendaria por ejército.';
  }
  if (cardEnergy({ cards: deck }) + card.cost > ENERGY) return 'No te alcanza la energía.';
  return null;
}

function renderDeck(): void {
  const slots: HTMLElement[] = [];
  for (let i = 0; i < MAX_CARDS; i++) {
    const play = deck[i];
    const slot = document.createElement('div');
    slot.className = 'slot';
    if (!play) {
      slot.classList.add('empty');
      slot.textContent = 'Espacio libre';
    } else {
      slot.append(cardElement(CARDS[play.card], 'mini'));
      const controls = document.createElement('div');
      controls.className = 'slot-controls';
      const select = document.createElement('select');
      for (let t = 1; t <= CARD_TURN_MAX; t++) select.append(new Option(`Turno ${t}`, String(t), false, t === play.turn));
      select.onchange = () => { play.turn = Number(select.value); };
      const remove = document.createElement('button');
      remove.className = 'btn ghost small';
      remove.textContent = 'Quitar';
      remove.onclick = () => { deck.splice(i, 1); renderAll(); };
      controls.append(select, remove);
      slot.append(controls);
    }
    slots.push(slot);
  }
  $('deck').replaceChildren(...slots);
  $('collection').replaceChildren(...cardsForRace(race).map((card) => {
    const el = cardElement(card, 'mini');
    const blocker = cardBlocker(card);
    if (blocker) {
      el.classList.add('disabled');
      el.title = blocker;
    }
    el.onclick = () => {
      if (battling) return;
      const why = cardBlocker(card);
      if (why) return setStatus(why);
      deck.push({ card: card.id, turn: Math.min(CARD_TURN_MAX, deck.length + 1) });
      sound.play(card.rarity === 'legendary' ? 'legendary' : 'card', 0.6);
      setStatus(`${card.name} añadida. Elige en qué turno se lanza.`);
      renderAll();
    };
    return el;
  }));
}

// ---------- Armería ----------

function renderArmors(): void {
  $('armors').replaceChildren(...ARMOR_IDS.map((id) => {
    const set = ARMORS[id];
    const b = document.createElement('button');
    b.className = `armor r-${set.rarity}${id === armor ? ' selected' : ''}`;
    const preview = document.createElement('div');
    preview.className = 'armor-preview';
    preview.append(spriteCanvas('guardian', race, id, 72), spriteCanvas('knight', race, id, 72), spriteCanvas('mage', race, id, 72));
    const text = document.createElement('div');
    text.innerHTML = `<strong style="color:${RARITY_COLORS[set.rarity].light}">${set.name}</strong>
      <span class="rarity" style="color:${RARITY_COLORS[set.rarity].main}">${RARITIES[set.rarity].name}</span>
      <span class="desc">${set.description}</span>`;
    b.append(preview, text);
    b.onclick = () => { armor = id; renderAll(); };
    return b;
  }));
}

// ---------- Contadores ----------

function refresh(): void {
  const gold = armyCost({ units: placements });
  const energy = cardEnergy({ cards: deck });
  $('gold').textContent = `${BUDGET - gold} / ${BUDGET}`;
  $('gold-bar').style.width = `${(100 * (BUDGET - gold)) / BUDGET}%`;
  $('energy').textContent = `${ENERGY - energy} / ${ENERGY}`;
  $('energy-bar').style.width = `${(100 * (ENERGY - energy)) / ENERGY}%`;
  $<HTMLButtonElement>('simulate').disabled = placements.length === 0 || battling;
  $<HTMLButtonElement>('submit').disabled = placements.length === 0;
  $('edit').hidden = !battling;
  $('speed').hidden = !battling;
  $('skip').hidden = !battling;
  syncTelegramButtons();
  refreshScene();
}

function renderAll(): void {
  renderRaces();
  renderPalette();
  renderDeck();
  renderArmors();
  refresh();
}

// ---------- Batalla ----------

const castBox = $('card-cast');
const turnBox = $('turn');
const resultBox = $('result');
let replayLabels: [string, string] = ['Tú', 'Rival'];
let replaySide: Side = 0;

scene.hooks = {
  onTurn: (turn) => {
    sound.play('turn', 0.6);
    turnBox.hidden = false;
    turnBox.textContent = `Turno ${turn}`;
    turnBox.classList.remove('pop');
    void turnBox.offsetWidth;
    turnBox.classList.add('pop');
  },
  onCard: (side, id, fizzled) => {
    const el = cardElement(CARDS[id], 'hero');
    const wrap = document.createElement('div');
    wrap.className = `cast ${side === replaySide ? 'mine' : 'theirs'}${fizzled ? ' fizzled' : ''}`;
    const who = document.createElement('div');
    who.className = 'cast-who';
    who.textContent = `${replayLabels[side]} lanza`;
    wrap.append(who, el);
    castBox.replaceChildren(wrap);
  },
  onCardEnd: () => {
    const wrap = castBox.firstElementChild;
    if (wrap) wrap.classList.add('out');
  },
  onFinish: () => finishBattle(),
  onSfx: (name, intensity) => {
    sound.play(name, intensity);
    if (name === 'heavy' || name === 'explosion' || name === 'legendary') tg?.HapticFeedback?.impactOccurred('heavy');
    else if (name === 'hit') tg?.HapticFeedback?.impactOccurred('light');
  },
};

let lastResult: BattleResult | null = null;

function playBattle(result: BattleResult, looks: [Look, Look], mySide: Side, labels: [string, string]): void {
  battling = true;
  lastResult = result;
  replayLabels = labels;
  replaySide = mySide;
  resultBox.hidden = true;
  castBox.replaceChildren();
  scene.hover = null;
  scene.ghost = null;
  scene.speed = SPEEDS[speedIndex];
  scene.play(result, looks, mySide);
  sound.setMusic('battle');
  setStatus(`${labels[mySide]} (azul) contra ${labels[mySide === 0 ? 1 : 0]} (rojo)`);
  refresh();
}

function finishBattle(): void {
  const r = lastResult;
  if (!r) return;
  battlesFinished++;
  castBox.replaceChildren();
  turnBox.hidden = true;
  const why = r.reason === 'timeout' ? 'por puntos al agotar los turnos' : `en ${r.turns} turnos`;
  const [title, tone] = r.winner === null ? ['Empate', ''] : r.winner === replaySide ? ['¡Victoria!', 'win'] : ['Derrota', 'loss'];
  resultBox.className = `result ${tone}`;
  resultBox.innerHTML = `<div class="result-title">${title}</div><div class="result-sub">${r.winner === null ? 'Nadie cede terreno' : `${replayLabels[r.winner]} gana ${why}`}</div>`;
  resultBox.hidden = false;
  sound.setMusic('menu');
  if (r.winner !== null) sound.play(r.winner === replaySide ? 'victory' : 'defeat');
  tg?.HapticFeedback?.notificationOccurred(r.winner === replaySide ? 'success' : r.winner === null ? 'warning' : 'error');
  setStatus(r.winner === null ? 'Empate.' : `${replayLabels[r.winner]} gana ${why}.`, (tone || '') as '' | 'win' | 'loss');
}

function stopBattle(): void {
  if (battling) sound.setMusic('menu');
  battling = false;
  resultBox.hidden = true;
  turnBox.hidden = true;
  castBox.replaceChildren();
  refresh();
}

opponentSelect.replaceChildren(...Object.entries(PRESET_ARMIES).map(([id, p]) => new Option(`${p.name} (${RACES[p.army.race].name})`, id)));
opponentSelect.onchange = () => refreshScene();

$('simulate').onclick = () => {
  const check = validateArmy(currentArmy());
  if (!check.ok) return setStatus(check.error);
  const preset = PRESET_ARMIES[opponentSelect.value];
  // La práctica se simula en el navegador con el mismo motor que usa el servidor.
  playBattle(simulate(check.army, preset.army), [look(), { race: preset.army.race, armor: preset.army.armor ?? 'iron' }], 0, ['Tu ejército', preset.name]);
};
$('edit').onclick = () => { stopBattle(); setStatus('Ajusta tu ejército y vuelve a la batalla.'); };
$('clear').onclick = () => { stopBattle(); placements = []; deck = []; renderAll(); };
$('skip').onclick = () => scene.skip();
$('speed').onclick = () => {
  speedIndex = (speedIndex + 1) % SPEEDS.length;
  scene.speed = SPEEDS[speedIndex];
  $('speed').textContent = `Velocidad ×${SPEEDS[speedIndex]}`;
};
resultBox.onclick = () => { resultBox.hidden = true; };

// ---------- Pestañas ----------

type Tab = 'army' | 'cards' | 'armory' | 'tournaments';

function openTab(name: Tab): void {
  for (const t of $('tabs').querySelectorAll<HTMLButtonElement>('button')) t.classList.toggle('active', t.dataset.tab === name);
  for (const panel of document.querySelectorAll<HTMLElement>('[data-panel]')) panel.hidden = panel.dataset.panel !== name;
  if (name === 'tournaments') loadTournaments();
}

for (const tab of $('tabs').querySelectorAll<HTMLButtonElement>('button')) {
  tab.onclick = () => openTab(tab.dataset.tab as Tab);
}

// ---------- Torneos ----------

const playerInput = $<HTMLInputElement>('player');
try { playerInput.value = localStorage.getItem('bastion.player') ?? ''; } catch { /* almacenamiento no disponible */ }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (session) headers.authorization = `Bearer ${session.token}`;
  const res = await fetch(path, { ...init, headers });
  const body = await res.json().catch(() => ({ error: `Error ${res.status}` }));
  if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
  return body as T;
}

interface TournamentView {
  id: string; name: string; status: string; closesAt: string; entryFee: number; pool: number; entryCount: number;
  entries?: Array<{ playerId: string; army: Army }>;
  result?: { standings: Array<{ id: string; rank: number; points: number }>; plan: { payouts: Array<{ id: string; amount: number }> } };
}

const usdc = (units: number) => `${(units / 1_000_000).toLocaleString('es', { maximumFractionDigits: 2 })} USDC`;
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

$('submit').onclick = async () => {
  const out = $('submit-status');
  const playerId = session?.playerId ?? playerInput.value.trim();
  try { localStorage.setItem('bastion.player', playerId); } catch { /* opcional */ }
  try {
    const list = await api<TournamentView[]>('/api/tournaments');
    const arena = list.find((t) => t.status === 'open' && t.entryFee === 0);
    if (!arena) throw new Error('No hay una arena gratuita abierta ahora mismo.');
    const r = await api<{ commitment: string }>(`/api/tournaments/${arena.id}/entries`, {
      method: 'POST', body: JSON.stringify({ playerId, army: currentArmy() }),
    });
    out.textContent = `Inscrito en ${arena.name}. Compromiso: ${r.commitment.slice(0, 16)}…`;
    loadTournaments();
  } catch (err) {
    out.textContent = (err as Error).message;
  }
};

async function loadTournaments(): Promise<void> {
  const box = $('tournaments');
  try {
    const list = await api<TournamentView[]>('/api/tournaments');
    if (list.length === 0) { box.textContent = 'No hay torneos todavía.'; return; }
    box.replaceChildren(...list.slice(-5).reverse().map((t) => {
      const div = document.createElement('div');
      div.className = 'tournament';
      const when = new Date(t.closesAt).toLocaleString('es');
      div.innerHTML = `<strong>${escapeHtml(t.name)}</strong><br>
        ${t.status === 'closed' ? 'Cerrado' : `Cierra ${when}`} · ${t.entryCount} inscritos · Pozo ${usdc(t.pool)}
        ${t.entryFee ? ` · Entrada ${usdc(t.entryFee)}` : ' · Gratis'}`;
      if (t.status === 'closed') {
        const b = document.createElement('button');
        b.className = 'btn small';
        b.textContent = 'Ver clasificación';
        b.onclick = () => showStandings(t.id, div);
        div.append(document.createElement('br'), b);
      }
      return div;
    }));
  } catch {
    box.textContent = 'Servidor no disponible. La práctica contra la IA funciona igualmente.';
  }
}

async function showStandings(id: string, container: HTMLElement): Promise<void> {
  const t = await api<TournamentView>(`/api/tournaments/${id}`);
  if (!t.result) return;
  const armies = new Map((t.entries ?? []).map((e) => [e.playerId, e.army]));
  const lookOf = (player: string): Look => ({ race: armies.get(player)?.race ?? 'human', armor: armies.get(player)?.armor ?? 'iron' });
  const prize = new Map(t.result.plan.payouts.map((p) => [p.id, p.amount]));
  const table = document.createElement('table');
  table.innerHTML = '<tr><th>#</th><th>Jugador</th><th>Raza</th><th class="num">Pts</th><th class="num">Premio</th></tr>';
  for (const s of t.result.standings.slice(0, 10)) {
    const tr = table.insertRow();
    const r = armies.get(s.id)?.race;
    tr.innerHTML = `<td>${s.rank}</td><td>${escapeHtml(s.id)}</td><td>${r ? RACES[r].name : ''}</td><td class="num">${s.points}</td><td class="num">${prize.has(s.id) ? usdc(prize.get(s.id)!) : ''}</td>`;
    tr.title = 'Ver la batalla contra el primer clasificado';
    tr.onclick = async () => {
      const leader = t.result!.standings[0].id;
      const rival = s.id === leader ? t.result!.standings[1]?.id : leader;
      if (!rival) return;
      const result = await api<BattleResult>(`/api/tournaments/${id}/replay?left=${encodeURIComponent(s.id)}&right=${encodeURIComponent(rival)}`);
      playBattle(result, [lookOf(s.id), lookOf(rival)], 0, [s.id, rival]);
    };
  }
  container.append(table);
}

// ---------- Sonido ----------

const muteButton = $<HTMLButtonElement>('mute');
const renderMute = () => {
  muteButton.textContent = sound.isMuted ? '🔇 Sonido' : '🔊 Sonido';
  muteButton.setAttribute('aria-pressed', String(sound.isMuted));
};
muteButton.onclick = () => {
  sound.unlock();
  sound.setMuted(!sound.isMuted);
  renderMute();
};
renderMute();
// El navegador solo permite audio después de una interacción del usuario.
window.addEventListener('pointerdown', () => {
  sound.unlock();
  if (!battling) sound.setMusic('menu');
}, { once: true });
document.addEventListener('click', (ev) => {
  if ((ev.target as HTMLElement).closest('button, .race, .unit, .armor')) sound.play('click');
});

// ---------- Tutorial ----------

let battlesFinished = 0;
const tutorial = new Tutorial([
  {
    title: '¡Bienvenido a Bastión!',
    text: 'En un minuto ganarás tu primera batalla. Armas un ejército, lo colocas, eliges cartas… y la batalla se resuelve sola, sin azar: gana la mejor estrategia.',
    next: 'Empezar',
  },
  {
    target: '#races',
    title: 'Elige tu raza',
    text: 'Cada raza cambia a tus unidades y tiene su propia carta legendaria. Los Orcos son brutales; los Enanos, un muro de hierro.',
  },
  {
    target: '#palette',
    title: 'Tus unidades',
    onEnter: () => openTab('army'),
    text: 'El número dorado es su coste: tienes 12 de oro. Los valores en verde o rojo son las ventajas y desventajas de tu raza.',
  },
  {
    target: '.board-wrap',
    title: 'Despliega tu ejército',
    text: 'Elige una unidad y haz clic en las columnas iluminadas. Coloca al menos 3: las resistentes delante (a la derecha) y las de distancia detrás.',
    done: () => placements.length >= 3,
  },
  {
    target: '[data-panel="cards"]',
    title: 'Prepara una carta',
    onEnter: () => openTab('cards'),
    text: 'Añade una carta de la colección y elige en qué turno se lanza. El momento importa: una curación en el turno 1 no cura a nadie.',
    done: () => deck.length >= 1,
  },
  {
    target: '#simulate',
    title: '¡A la batalla!',
    text: 'Elige un rival y pulsa el botón. Puedes acelerar a ×2 o ×4, o saltar al final.',
    done: () => battling,
  },
  {
    target: '.board-wrap',
    title: 'Observa y aprende',
    text: 'Tu ejército lucha solo. El mismo planteamiento da siempre el mismo resultado: si pierdes, ajusta posiciones o cartas y vuelve a intentarlo.',
    done: () => battlesFinished > 0,
  },
  {
    target: '[data-tab="tournaments"]',
    title: 'Compite de verdad',
    text: 'Cuando estés listo, inscríbete gratis en la Arena diaria: tu ejército queda oculto y se enfrenta a todos los demás. Los mejores ganan premios.',
  },
]);
$('tutorial-open').onclick = () => {
  if (battling) stopBattle();
  tutorial.start();
};

// ---------- Telegram ----------

function syncTelegramButtons(): void {
  if (!tg) return;
  if (battling) {
    tg.MainButton.hide();
    tg.BackButton.show();
  } else {
    tg.BackButton.hide();
    if (placements.length > 0) tg.MainButton.show();
    else tg.MainButton.hide();
  }
}

initTelegram().then(async (app) => {
  if (!app) return;
  tg = app;
  document.body.classList.add('telegram');
  app.MainButton.setText('⚔ ¡A la batalla!');
  app.MainButton.onClick(() => $('simulate').click());
  app.BackButton.onClick(() => stopBattle());
  syncTelegramButtons();
  try {
    session = await api<{ token: string; playerId: string; name: string }>('/api/auth/telegram', {
      method: 'POST', body: JSON.stringify({ initData: app.initData }),
    });
    playerInput.value = session.name;
    playerInput.readOnly = true;
    $('submit-status').textContent = `Conectado con Telegram como ${session.name}.`;
  } catch (err) {
    $('submit-status').textContent = `No se pudo iniciar sesión con Telegram: ${(err as Error).message}`;
  }
});

renderAll();
if (!tutorialSeen()) tutorial.start();
// Las ilustraciones generadas se cargan aparte; al llegar, se vuelve a pintar.
loadArt().then(() => {
  const keyart = artUrl('scenes/keyart');
  if (keyart) document.body.style.setProperty('--keyart', `url("${keyart}")`);
  renderAll();
});
