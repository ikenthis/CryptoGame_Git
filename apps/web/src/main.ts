import {
  ARMORS, ARMOR_IDS, BOSSES, BUDGET, CARDS, CARD_TURN_MAX, CATEGORIES, COMMANDERS, DEPLOY_COLUMNS, ENERGY, MAX_CARDS,
  MAX_LEGENDARY_CARDS, MAX_SUPPLIES, MAX_UNITS, MISSIONS, PRESET_ARMIES, RACES, RACE_IDS, RARITIES, RESOURCES, RESOURCE_IDS,
  UNITS, UNIT_TYPES,
  armyCost, cardEnergy, cardsForRace, commandersForRace, missionById, missionUnlocked, ownsCard,
  ownsCommander, rewardSummary, simulate, statsFor, validateArmy,
  type ArmorId, type Army, type BattleArmy, type BattleResult, type Card, type CardCategory, type CardPlay,
  type CommanderId, type CommanderPlacement, type Placement, type Race, type Side, type Special, type UnitType,
} from '@gentium/engine';
import { artUrl, loadArt } from './art/assets.ts';
import { RACE_EMBLEM } from './art/icons.ts';
import { getSprite } from './art/sprites.ts';
import { RARITY_COLORS } from './art/theme.ts';
import { sound } from './audio/sound.ts';
import { initTelegram, launchedFromTelegram, type TelegramWebApp } from './platform/telegram.ts';
import { Scene, type BuildArmy, type Look } from './scene/scene.ts';
import { api, connect, connectGuest, getSession, market, online, perform, playMission, verified, type Listing, type MissionRun } from './state/backend.ts';
import { getProfile, onProfile, today } from './state/profile.ts';
import { renderCampaign } from './ui/campaign.ts';
import { cardElement } from './ui/card.ts';
import { commanderElement } from './ui/commander.ts';
import { renderMarket } from './ui/market.ts';
import { showLoot } from './ui/modal.ts';
import { Tutorial, tutorialSeen } from './ui/tutorial.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** true en la demo publicada sin servidor (ver vite.config.ts). */
declare const __DEMO__: boolean;

// ---------- Estado ----------

let race: Race = 'human';
let armor: ArmorId = 'royal';
let placements: Placement[] = [];
let commander: CommanderPlacement | null = null;
/** Comandante elegido para cada raza (se recuerda al cambiar de raza). */
const chosenCommander: Partial<Record<Race, CommanderId>> = {};
let deck: CardPlay[] = [];
let selected: UnitType | 'commander' = 'commander';
let cardFilter: CardCategory | 'all' = 'all';
/** Contra quién se juega: un rival de práctica o una misión de campaña. */
let target: { kind: 'preset' | 'mission'; id: string } = { kind: 'preset', id: 'horde' };
let battling = false;
/** Ventas del mercado entre jugadores (se cargan al abrir la pestaña). */
let listings: Listing[] = [];
const SPEEDS = [1, 2, 4];
let speedIndex = 0;
/** Presente solo cuando el juego se abre como Mini App de Telegram. */
let tg: TelegramWebApp | null = null;

const scene = new Scene($<HTMLCanvasElement>('board'));
const statusEl = $('status');
const opponentSelect = $<HTMLSelectElement>('opponent');

const commanderId = (): CommanderId | null => {
  const chosen = chosenCommander[race];
  if (chosen && ownsCommander(getProfile(), chosen)) return chosen;
  return commandersForRace(race).find((c) => ownsCommander(getProfile(), c.id))?.id ?? null;
};
const currentArmy = (): Army => ({
  race, armor, units: placements, cards: deck, ...(commander ? { commander } : {}),
});
const look = (): Look => ({ race, armor });

function setStatus(text: string, tone: '' | 'win' | 'loss' = ''): void {
  statusEl.textContent = text;
  statusEl.className = `status ${tone}`;
}

function enemyArmy(): { army: BattleArmy; name: string } {
  if (target.kind === 'mission') {
    const m = missionById(target.id);
    return { army: m.enemy, name: m.name };
  }
  const preset = PRESET_ARMIES[target.id];
  return { army: preset.army, name: preset.name };
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
  const unitAt = placements.findIndex((p) => p.x === cell.x && p.y === cell.y);
  const commanderAt = commander && commander.x === cell.x && commander.y === cell.y;
  if (commanderAt) {
    commander = null;
    sound.play('remove');
    setStatus('Comandante retirado. Elígelo de nuevo para colocarlo.');
  } else if (unitAt >= 0) {
    placements.splice(unitAt, 1);
    sound.play('remove');
  } else if (selected === 'commander') {
    const id = commanderId();
    if (!id) return setStatus('No tienes ningún comandante de esta raza. Consíguelo en el Mercado Negro.');
    commander = { id, x: cell.x, y: cell.y };
    sound.play('legendary', 0.4);
    selected = 'warrior';
    setStatus(`${COMMANDERS[id].name} toma el mando. Ahora coloca tus tropas.`);
    renderAll();
    return;
  } else if (placements.length >= MAX_UNITS) return setStatus(`Máximo ${MAX_UNITS} unidades.`);
  else if (armyCost({ units: placements }) + UNITS[selected].cost > BUDGET) return setStatus('No te alcanza el oro.');
  else {
    placements.push({ type: selected, x: cell.x, y: cell.y });
    sound.play('place');
    setStatus('Clic sobre una unidad para retirarla.');
  }
  refresh();
});

function refreshScene(): void {
  if (battling) return;
  const id = commanderId();
  const ghostSpecial: Special | undefined = selected === 'commander' && id ? { kind: 'commander', id } : undefined;
  scene.ghost = { type: selected, look: look(), ...(ghostSpecial ? { special: ghostSpecial } : {}) };
  const enemy = enemyArmy().army;
  const mine: BuildArmy = { units: placements, commander, look: look() };
  scene.setBuild(mine, {
    units: enemy.units, commander: enemy.commander ?? null, bosses: enemy.bosses,
    look: { race: enemy.race, armor: enemy.armor ?? 'iron' },
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
      if (battling || id === race) return;
      race = id;
      deck = deck.filter((c) => CARDS[c.card].race === null || CARDS[c.card].race === race);
      // El comandante es de una raza concreta: se cambia por el de la nueva raza en la misma casilla.
      const next = commanderId();
      commander = commander && next ? { ...commander, id: next } : null;
      renderAll();
    };
    return b;
  }));
  const info = RACES[race];
  $('race-trait').innerHTML = `${raceBadge(race)}<div><strong>${info.realm}</strong> · <em>${info.trait}</em><br>${info.description}</div>`;
}

// ---------- Comandante y unidades ----------

function spriteCanvas(type: UnitType, r: Race, a: ArmorId, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = c.height = size * dpr;
  c.style.width = c.style.height = `${size}px`;
  c.getContext('2d')!.drawImage(getSprite(type, r, a, 1), 0, 0, size * dpr, size * dpr);
  return c;
}

function renderCommanders(): void {
  const profile = getProfile();
  const active = commanderId();
  $('commanders').replaceChildren(...commandersForRace(race).map((def) => {
    const owned = ownsCommander(profile, def.id);
    const el = commanderElement(def, 'mini', owned);
    el.classList.toggle('selected', def.id === active);
    if (def.id === active && commander) el.classList.add('placed');
    el.onclick = () => {
      if (battling) return;
      if (!owned) return setStatus(`${def.name} aún no es tuyo: consíguelo en sobres de comandante o en la campaña.`);
      chosenCommander[race] = def.id;
      if (commander) commander = { ...commander, id: def.id };
      selected = 'commander';
      setStatus(commander ? `${def.name} está al mando.` : `Haz clic en tu zona para colocar a ${def.name}.`);
      renderAll();
    };
    return el;
  }));
}

function renderPalette(): void {
  $('palette').replaceChildren(...UNIT_TYPES.map((type) => {
    const base = UNITS[type];
    const passive = commander ? COMMANDERS[commander.id].passive.mods[type] ?? {} : {};
    const s = statsFor(type, race, passive);
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
  if (!ownsCard(getProfile(), card.id)) return 'Aún no la tienes: consíguela en la Campaña o en el Mercado Negro.';
  if (deck.some((c) => c.card === card.id)) return 'Ya está en tu mazo.';
  if (deck.length >= MAX_CARDS) return `Máximo ${MAX_CARDS} cartas.`;
  if (card.rarity === 'legendary' && deck.filter((c) => CARDS[c.card].rarity === 'legendary').length >= MAX_LEGENDARY_CARDS) {
    return 'Solo una legendaria por ejército.';
  }
  if (cardEnergy({ cards: deck }) + card.cost > ENERGY) return 'No te alcanza la energía.';
  return null;
}

function renderDeck(): void {
  const profile = getProfile();
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

  $('card-filters').replaceChildren(...(['all', ...Object.keys(CATEGORIES)] as Array<CardCategory | 'all'>).map((cat) => {
    const chip = document.createElement('button');
    chip.className = `chip${cat === cardFilter ? ' active' : ''}`;
    chip.textContent = cat === 'all' ? 'Todas' : CATEGORIES[cat];
    chip.onclick = () => { cardFilter = cat; renderDeck(); };
    return chip;
  }));

  const cards = cardsForRace(race).filter((c) => cardFilter === 'all' || c.category === cardFilter);
  $('collection').replaceChildren(...cards.map((card) => {
    const el = cardElement(card, 'mini');
    const count = profile.cards[card.id] ?? 0;
    const badge = document.createElement('span');
    badge.className = 'count';
    badge.textContent = count ? `×${count}` : '🔒';
    el.append(badge);
    const blocker = cardBlocker(card);
    if (!count) el.classList.add('locked');
    else if (blocker) el.classList.add('disabled');
    el.title = blocker ?? `${card.name}: ${card.text}`;
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

// ---------- Recursos, campaña y mercado ----------

function renderHud(): void {
  const r = getProfile().resources;
  $('hud').innerHTML = RESOURCE_IDS.map((id) => {
    const value = id === 'supplies' ? `${r.supplies}/${MAX_SUPPLIES}` : r[id];
    return `<span class="res res-${id}" title="${RESOURCES[id].name}">${RESOURCES[id].icon} <b>${value}</b></span>`;
  }).join('');
}

function prepareMission(id: string): void {
  if (battling) stopBattle();
  target = { kind: 'mission', id };
  renderOpponents();
  const m = missionById(id);
  setStatus(`${m.kind === 'raid' ? 'Incursión' : 'Misión'}: ${m.name}. Despliega tu ejército y pulsa ¡A la batalla! (🍖 ${m.cost}).`);
  renderAll();
  document.querySelector('.board-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderSidePanels(): void {
  const profile = getProfile();
  renderCampaign($('campaign'), { profile, selected: target.kind === 'mission' ? target.id : null, onPrepare: prepareMission });
  renderMarket($('market'), {
    profile, perform, day: today(),
    p2p: { online: online(), verified: verified(), me: getSession()?.playerId ?? '', listings, market, reload: loadListings },
    onLoot: (view) => { sound.play(view.commanders?.length || view.cards?.some((c) => CARDS[c].rarity === 'legendary') ? 'legendary' : 'card'); showLoot(view); },
    onError: (message) => setStatus(message, 'loss'),
  });
}

function renderOpponents(): void {
  const profile = getProfile();
  const practice = document.createElement('optgroup');
  practice.label = 'Práctica (sin coste)';
  for (const [id, p] of Object.entries(PRESET_ARMIES)) practice.append(new Option(`${p.name} (${RACES[p.army.race].name})`, `preset:${id}`));
  const campaign = document.createElement('optgroup');
  campaign.label = 'Campaña e incursiones';
  for (const m of MISSIONS) {
    if (!missionUnlocked(profile, m)) continue;
    campaign.append(new Option(`${m.kind === 'raid' ? '☠ ' : ''}${m.name} (🍖 ${m.cost})`, `mission:${m.id}`));
  }
  opponentSelect.replaceChildren(practice, campaign);
  opponentSelect.value = `${target.kind}:${target.id}`;
}

opponentSelect.onchange = () => {
  const [kind, id] = opponentSelect.value.split(':') as ['preset' | 'mission', string];
  target = { kind, id };
  renderSidePanels();
  refreshScene();
};

// ---------- Contadores ----------

function refresh(): void {
  const gold = armyCost({ units: placements });
  const energy = cardEnergy({ cards: deck });
  $('gold').textContent = `${BUDGET - gold} / ${BUDGET}`;
  $('gold-bar').style.width = `${(100 * (BUDGET - gold)) / BUDGET}%`;
  $('energy').textContent = `${ENERGY - energy} / ${ENERGY}`;
  $('energy-bar').style.width = `${(100 * (ENERGY - energy)) / ENERGY}%`;
  $<HTMLButtonElement>('simulate').disabled = placements.length === 0 || battling;
  $<HTMLButtonElement>('submit').disabled = placements.length === 0 || !commander;
  $('edit').hidden = !battling;
  $('speed').hidden = !battling;
  $('skip').hidden = !battling;
  syncTelegramButtons();
  refreshScene();
}

function renderAll(): void {
  renderHud();
  renderRaces();
  renderCommanders();
  renderPalette();
  renderDeck();
  renderArmors();
  renderSidePanels();
  refresh();
}

onProfile(() => {
  renderHud();
  renderCommanders();
  renderDeck();
  renderSidePanels();
});

// ---------- Batalla ----------

const castBox = $('card-cast');
const turnBox = $('turn');
const resultBox = $('result');
const vsBox = $('vs');
const bannerBox = $('banner');
let replayLabels: [string, string] = ['Tú', 'Rival'];
let replaySide: Side = 0;
let battleArmies: [BattleArmy, BattleArmy] | null = null;

function leaderName(army: BattleArmy): string {
  if (army.bosses?.length) return BOSSES[army.bosses[0].id].name;
  return army.commander ? COMMANDERS[army.commander.id].name : RACES[army.race].name;
}

function showBanner(html: string, tone: 'ally' | 'enemy' | 'doom'): void {
  bannerBox.className = `banner ${tone}`;
  bannerBox.innerHTML = html;
  bannerBox.hidden = false;
}

scene.hooks = {
  onIntro: () => {
    if (!battleArmies) return;
    const [a, b] = battleArmies;
    const side = (army: BattleArmy, label: string, cls: string) => `
      <div class="vs-side ${cls}">
        <span class="vs-emblem">${RACE_EMBLEM[army.race]}</span>
        <strong>${leaderName(army)}</strong>
        <small>${label}</small>
      </div>`;
    vsBox.innerHTML = `${side(a, replayLabels[0], 'left')}<div class="vs-mark">VS</div>${side(b, replayLabels[1], 'right')}`;
    vsBox.hidden = false;
    setTimeout(() => { vsBox.hidden = true; }, 1500 / Math.max(1, scene.speed));
  },
  onAbility: (side, caster, name, fizzled) => {
    const who = caster?.kind === 'commander' ? `${COMMANDERS[caster.id].name}, ${COMMANDERS[caster.id].title}`
      : caster?.kind === 'boss' ? `${BOSSES[caster.id].name}, ${BOSSES[caster.id].title}` : replayLabels[side];
    const tone = caster?.kind === 'boss' ? 'doom' : side === replaySide ? 'ally' : 'enemy';
    showBanner(`<small>${who}</small><strong>${name}</strong>${fizzled ? '<small>Sin efecto</small>' : ''}`, tone);
  },
  onAbilityEnd: () => { bannerBox.hidden = true; },
  onMorale: (side) => {
    showBanner(`<small>${replayLabels[side]}</small><strong>¡Ha caído el comandante!</strong><small>Sus tropas pierden 1 de ataque</small>`, side === replaySide ? 'enemy' : 'ally');
  },
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
/** Misión en curso: sus recompensas se entregan al terminar la animación. */
let pendingMission: { id: string; run: MissionRun } | null = null;

function playBattle(result: BattleResult, armies: [BattleArmy, BattleArmy], mySide: Side, labels: [string, string]): void {
  battling = true;
  lastResult = result;
  battleArmies = armies;
  replayLabels = labels;
  replaySide = mySide;
  resultBox.hidden = true;
  bannerBox.hidden = true;
  castBox.replaceChildren();
  scene.hover = null;
  scene.ghost = null;
  scene.speed = SPEEDS[speedIndex];
  const lookOf = (a: BattleArmy): Look => ({ race: a.race, armor: a.armor ?? 'iron' });
  scene.play(result, [lookOf(armies[0]), lookOf(armies[1])], mySide);
  sound.setMusic('battle');
  setStatus(`${labels[mySide]} (azul) contra ${labels[mySide === 0 ? 1 : 0]} (rojo)`);
  refresh();
}

function finishBattle(): void {
  const r = lastResult;
  if (!r) return;
  battlesFinished++;
  castBox.replaceChildren();
  bannerBox.hidden = true;
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

  if (pendingMission) {
    const { id, run } = pendingMission;
    pendingMission = null;
    const outcome = run.finish();
    const m = missionById(id);
    const subtitle = m.kind === 'raid'
      ? `Daño al jefe: ${outcome.damagePct}%${outcome.won ? ' · ¡Jefe derrotado!' : ''}`
      : outcome.won ? '¡Victoria! Tu ejército vuelve cargado de botín.' : 'Derrota. Tus exploradores rescatan algo de oro.';
    setTimeout(() => showLoot({
      title: m.name, subtitle, lines: rewardSummary(outcome.reward),
      cards: outcome.reward.cards, commanders: outcome.reward.commanders,
    }), 900);
    renderOpponents();
  }
}

function stopBattle(): void {
  if (battling) sound.setMusic('menu');
  battling = false;
  resultBox.hidden = true;
  turnBox.hidden = true;
  bannerBox.hidden = true;
  vsBox.hidden = true;
  castBox.replaceChildren();
  refresh();
}

let launching = false;
$('simulate').onclick = async () => {
  if (launching) return;
  const check = validateArmy(currentArmy());
  if (!check.ok) return setStatus(check.error);
  const { army: enemy, name } = enemyArmy();
  if (target.kind === 'mission') {
    // Con servidor, la misión se resuelve allí (las recompensas no dependen del navegador).
    launching = true;
    try {
      const id = target.id;
      const run = await playMission(id, check.army, enemy);
      pendingMission = { id, run };
      playBattle(run.result, [check.army, enemy], 0, ['Tu ejército', name]);
    } catch (err) {
      setStatus((err as Error).message, 'loss');
    } finally {
      launching = false;
    }
    return;
  }
  // Práctica: se simula en el navegador con el mismo motor que usa el servidor.
  playBattle(simulate(check.army, enemy), [check.army, enemy], 0, ['Tu ejército', name]);
};
$('edit').onclick = () => { stopBattle(); setStatus('Ajusta tu ejército y vuelve a la batalla.'); };
$('clear').onclick = () => { stopBattle(); placements = []; deck = []; commander = null; renderAll(); };
$('skip').onclick = () => scene.skip();
$('speed').onclick = () => {
  speedIndex = (speedIndex + 1) % SPEEDS.length;
  scene.speed = SPEEDS[speedIndex];
  $('speed').textContent = `Velocidad ×${SPEEDS[speedIndex]}`;
};
resultBox.onclick = () => { resultBox.hidden = true; };

// ---------- Pestañas ----------

type Tab = 'army' | 'cards' | 'armory' | 'campaign' | 'market' | 'tournaments';

function openTab(name: Tab): void {
  for (const t of $('tabs').querySelectorAll<HTMLButtonElement>('button')) t.classList.toggle('active', t.dataset.tab === name);
  for (const panel of document.querySelectorAll<HTMLElement>('[data-panel]')) panel.hidden = panel.dataset.panel !== name;
  if (name === 'tournaments') loadTournaments();
  if (name === 'market') loadListings();
}

for (const tab of $('tabs').querySelectorAll<HTMLButtonElement>('button')) {
  tab.onclick = () => openTab(tab.dataset.tab as Tab);
}

// ---------- Torneos ----------

const playerInput = $<HTMLInputElement>('player');
const walletInput = $<HTMLInputElement>('wallet');
try {
  playerInput.value = localStorage.getItem('gentium.player') ?? '';
  walletInput.value = localStorage.getItem('gentium.wallet') ?? '';
} catch { /* almacenamiento no disponible */ }


interface TournamentView {
  id: string; name: string; status: string; closesAt: string; entryFee: number; pool: number; entryCount: number;
  entries?: Array<{ playerId: string; army: Army }>;
  result?: { standings: Array<{ id: string; rank: number; points: number }>; plan: { payouts: Array<{ id: string; amount: number }> } };
}

const usdc = (units: number) => `${(units / 1_000_000).toLocaleString('es', { maximumFractionDigits: 2 })} USDC`;
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

$('submit').onclick = async () => {
  const out = $('submit-status');
  // Con Telegram, la identidad la pone el servidor; como invitado se usa el nombre escrito.
  const playerId = verified() ? getSession()!.playerId : playerInput.value.trim();
  const wallet = walletInput.value.trim();
  try {
    localStorage.setItem('gentium.player', playerId);
    localStorage.setItem('gentium.wallet', wallet);
  } catch { /* opcional */ }
  try {
    const list = await api<TournamentView[]>('/api/tournaments');
    const arena = list.find((t) => t.status === 'open' && t.entryFee === 0);
    if (!arena) throw new Error('No hay una arena gratuita abierta ahora mismo.');
    const r = await api<{ commitment: string }>(`/api/tournaments/${arena.id}/entries`, {
      method: 'POST', body: JSON.stringify({ playerId, army: currentArmy(), ...(wallet ? { wallet } : {}) }),
    });
    out.textContent = `Inscrito en ${arena.name}. Compromiso: ${r.commitment.slice(0, 16)}…`;
    loadTournaments();
  } catch (err) {
    out.textContent = (err as Error).message;
  }
};

async function loadTournaments(): Promise<void> {
  const box = $('tournaments');
  if (__DEMO__) return;
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
      const a = armies.get(s.id);
      const b = rival ? armies.get(rival) : undefined;
      if (!rival || !a || !b) return;
      const result = await api<BattleResult>(`/api/tournaments/${id}/replay?left=${encodeURIComponent(s.id)}&right=${encodeURIComponent(rival)}`);
      playBattle(result, [a, b], 0, [s.id, rival]);
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
    title: '¡Bienvenido a Bellum Gentium!',
    text: 'En un minuto ganarás tu primera batalla. Eliges un comandante, armas tu ejército, preparas cartas… y la batalla se resuelve sola, sin azar: gana la mejor estrategia.',
    next: 'Empezar',
  },
  {
    target: '#races',
    title: 'Elige tu raza',
    text: 'Cada raza cambia a tus unidades y tiene su propia carta legendaria. Los Orcos son brutales; los Enanos, un muro de hierro.',
  },
  {
    target: '#commanders',
    title: 'Tu comandante',
    onEnter: () => openTab('army'),
    text: 'Todo ejército necesita un líder. Su pasiva mejora a tus tropas y su habilidad se dispara sola en batalla. Si cae, tus tropas pierden moral. Toca uno y colócalo en el tablero.',
    done: () => commander !== null,
  },
  {
    target: '.board-wrap',
    title: 'Despliega tus tropas',
    text: 'Elige unidades y haz clic en las columnas iluminadas. Coloca al menos 3: las resistentes delante (a la derecha) y las de distancia detrás, protegiendo a tu comandante.',
    done: () => placements.length >= 3,
  },
  {
    target: '[data-panel="cards"]',
    title: 'Prepara una carta',
    onEnter: () => openTab('cards'),
    text: 'Hay cartas de ataque, defensa, efecto, curación e invocación. Añade una y elige en qué turno se lanza: el momento importa.',
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
    target: '[data-tab="campaign"]',
    title: 'Campaña y Mercado Negro',
    text: 'En la Campaña y las incursiones contra jefes ganas materiales y Fichas Extrañas. En el Mercado Negro las cambias por sobres, transmutas cartas y tratas con el Mercader.',
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
    const s = await api<{ token: string; playerId: string; name: string }>('/api/auth/telegram', {
      method: 'POST', body: JSON.stringify({ initData: app.initData }),
    });
    await connect(s);
    playerInput.value = s.name;
    playerInput.readOnly = true;
    $('submit-status').textContent = `Conectado con Telegram como ${s.name}.`;
    onConnected();
  } catch (err) {
    $('submit-status').textContent = `No se pudo iniciar sesión con Telegram: ${(err as Error).message}`;
  }
});

// Fuera de Telegram (y fuera de la demo), el progreso se guarda en el servidor
// con una sesión de invitado. Si no hay servidor, se sigue jugando en local.
if (!__DEMO__ && !launchedFromTelegram()) {
  void connectGuest().then((ok) => { if (ok) onConnected(); });
}

function onConnected(): void {
  renderOpponents();
  renderAll();
}

// ---------- Mercado entre jugadores ----------

async function loadListings(): Promise<void> {
  if (!online()) return;
  try {
    listings = await market.list();
    renderSidePanels();
  } catch { /* se reintenta al volver a la pestaña */ }
}

if (__DEMO__) {
  // Demo sin servidor: los torneos se anuncian en lugar de conectarse.
  const panel = document.querySelector<HTMLElement>('[data-panel="tournaments"]')!;
  for (const box of panel.children) (box as HTMLElement).hidden = true;
  panel.insertAdjacentHTML('afterbegin', `
    <div class="box">
      <h2>Torneos: beta cerrada</h2>
      <p>Esta es la demo de práctica. Los torneos con premio se abren pronto en la beta: arena diaria gratis, ejércitos ocultos hasta el cierre y premios en USDC para los mejores.</p>
      <p class="muted">¿Quieres entrar en la beta y en los primeros torneos? Pide acceso a quien te pasó este enlace.</p>
    </div>`);
}

renderOpponents();
renderAll();
if (!tutorialSeen()) tutorial.start();
// Las ilustraciones generadas se cargan aparte; al llegar, se vuelve a pintar.
loadArt().then(() => {
  const keyart = artUrl('scenes/keyart');
  if (keyart) document.body.style.setProperty('--keyart', `url("${keyart}")`);
  renderAll();
});
