import {
  BOARD_HEIGHT, BOARD_WIDTH, BUDGET, DEPLOY_COLUMNS, MAX_UNITS, PRESET_ARMIES, UNITS, UNIT_TYPES,
  armyCost, simulate, type Army, type BattleResult, type Placement, type UnitState, type UnitType,
} from '@bastion/engine';

const CELL = 72;
const FRAME_MS = 450;
const COLORS = { blue: '#4c9aff', red: '#ff6b6b', gold: '#f5c451', line: '#2a3542', zone: 'rgba(76,154,255,0.10)', text: '#06121f' };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('board');
const ctx = canvas.getContext('2d')!;
const statusEl = $('status');

let placements: Placement[] = [];
let selected: UnitType = 'warrior';
let replay: { result: BattleResult; frame: number; timer: number; mySide: 0 | 1 } | null = null;

// ---------- Tablero ----------

function setupCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = BOARD_WIDTH * CELL * dpr;
  canvas.height = BOARD_HEIGHT * CELL * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function draw(): void {
  ctx.clearRect(0, 0, BOARD_WIDTH * CELL, BOARD_HEIGHT * CELL);
  if (!replay) {
    ctx.fillStyle = COLORS.zone;
    ctx.fillRect(0, 0, DEPLOY_COLUMNS * CELL, BOARD_HEIGHT * CELL);
  }
  ctx.strokeStyle = COLORS.line;
  for (let x = 0; x <= BOARD_WIDTH; x++) line(x * CELL, 0, x * CELL, BOARD_HEIGHT * CELL);
  for (let y = 0; y <= BOARD_HEIGHT; y++) line(0, y * CELL, BOARD_WIDTH * CELL, y * CELL);

  if (!replay) {
    for (const p of placements) drawUnit(p.type, p.x, p.y, COLORS.blue, 1);
    return;
  }
  const { result, frame, mySide } = replay;
  const units = frame < 0 ? result.initial : result.frames[frame].units;
  const previous = frame <= 0 ? result.initial : result.frames[frame - 1].units;
  const colorOf = (u: UnitState) => (u.side === mySide ? COLORS.blue : COLORS.red);
  for (const u of units) drawUnit(u.type, u.x, u.y, colorOf(u), u.hp / UNITS[u.type].hp);

  if (frame < 0) return;
  const where = (id: number) => units.find((u) => u.id === id) ?? previous.find((u) => u.id === id);
  // Vida neta cambiada por objetivo en este turno (varios golpes se suman en un solo número).
  const delta = new Map<number, number>();
  for (const e of result.frames[frame].events) {
    if (e.kind === 'move' || e.kind === 'death') continue;
    const from = where(e.id);
    const to = where(e.target);
    if (!from || !to) continue;
    const heal = e.kind === 'heal';
    ctx.strokeStyle = heal ? '#5ee39a' : e.kind === 'splash' ? '#c792ea' : COLORS.gold;
    ctx.lineWidth = e.kind === 'attack' && e.charge ? 4 : 2;
    line(center(from.x), center(from.y), center(to.x), center(to.y));
    ctx.lineWidth = 1;
    delta.set(e.target, (delta.get(e.target) ?? 0) + (heal ? e.amount : -e.damage));
  }
  ctx.font = 'bold 15px system-ui';
  ctx.textAlign = 'center';
  for (const [id, change] of delta) {
    const to = where(id)!;
    ctx.fillStyle = change >= 0 ? '#5ee39a' : '#ffffff';
    ctx.fillText(change >= 0 ? `+${change}` : `${change}`, center(to.x) + 20, center(to.y) - 24);
  }
}

function drawUnit(type: UnitType, x: number, y: number, color: string, hpRatio: number): void {
  const cx = center(x);
  const cy = center(y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, CELL * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 22px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(UNITS[type].letter, cx, cy + 1);
  const w = CELL * 0.64;
  ctx.fillStyle = '#00000088';
  ctx.fillRect(cx - w / 2, cy + CELL * 0.36, w, 5);
  ctx.fillStyle = hpRatio > 0.5 ? '#5ee39a' : hpRatio > 0.25 ? COLORS.gold : COLORS.red;
  ctx.fillRect(cx - w / 2, cy + CELL * 0.36, w * Math.max(0, hpRatio), 5);
}

const center = (c: number) => c * CELL + CELL / 2;
function line(x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

canvas.addEventListener('click', (ev) => {
  if (replay) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((ev.clientX - rect.left) / rect.width) * BOARD_WIDTH);
  const y = Math.floor(((ev.clientY - rect.top) / rect.height) * BOARD_HEIGHT);
  if (x >= DEPLOY_COLUMNS) return setStatus('Solo puedes desplegar en tu zona (columnas azules).');
  const existing = placements.findIndex((p) => p.x === x && p.y === y);
  if (existing >= 0) placements.splice(existing, 1);
  else if (placements.length >= MAX_UNITS) return setStatus(`Máximo ${MAX_UNITS} unidades.`);
  else if (armyCost(currentArmy()) + UNITS[selected].cost > BUDGET) return setStatus('No te alcanza el presupuesto.');
  else placements.push({ type: selected, x, y });
  setStatus('Clic sobre una unidad para quitarla.');
  refresh();
});

// ---------- Panel de unidades ----------

function renderPalette(): void {
  const palette = $('palette');
  palette.replaceChildren(...UNIT_TYPES.map((type) => {
    const s = UNITS[type];
    const b = document.createElement('button');
    b.className = `unit${type === selected ? ' selected' : ''}`;
    b.title = s.description;
    b.innerHTML = `<span class="badge">${s.letter}</span>
      <span><span class="name">${s.name}</span><br><span class="stats">❤${s.hp} ⚔${s.attack} 🎯${s.range} 👟${s.speed}${s.armor ? ` 🛡${s.armor}` : ''}${s.heal ? ` ✚${s.heal}` : ''}</span></span>
      <span class="cost">${s.cost}</span>`;
    b.onclick = () => { selected = type; renderPalette(); setStatus(s.description); };
    return b;
  }));
}

function refresh(): void {
  const cost = armyCost(currentArmy());
  $('budget').textContent = `${BUDGET - cost} de ${BUDGET} libres · ${placements.length}/${MAX_UNITS} unidades`;
  $<HTMLButtonElement>('simulate').disabled = placements.length === 0 || replay !== null;
  $<HTMLButtonElement>('submit').disabled = placements.length === 0;
  $('edit').hidden = replay === null;
  draw();
}

const currentArmy = (): Army => ({ units: placements });

function setStatus(text: string, tone: '' | 'win' | 'loss' = ''): void {
  statusEl.textContent = text;
  statusEl.className = `status ${tone}`;
}

// ---------- Batalla ----------

function playBattle(result: BattleResult, mySide: 0 | 1, labels: [string, string]): void {
  stopReplay();
  replay = { result, frame: -1, timer: 0, mySide };
  refresh();
  setStatus(`${labels[mySide]} (azul) contra ${labels[1 - mySide]} (rojo)…`);
  replay.timer = window.setInterval(() => {
    if (!replay) return;
    if (replay.frame >= result.frames.length - 1) {
      window.clearInterval(replay.timer);
      const why = result.reason === 'timeout' ? ' (por puntos al agotar los turnos)' : '';
      if (result.winner === null) setStatus(`Empate${why}.`);
      else if (result.winner === mySide) setStatus(`¡Victoria de ${labels[mySide]} en ${result.turns} turnos${why}!`, 'win');
      else setStatus(`Gana ${labels[1 - mySide]} en ${result.turns} turnos${why}.`, 'loss');
      return;
    }
    replay.frame++;
    draw();
  }, FRAME_MS);
}

function stopReplay(): void {
  if (replay) window.clearInterval(replay.timer);
  replay = null;
}

const opponentSelect = $<HTMLSelectElement>('opponent');
opponentSelect.replaceChildren(...Object.entries(PRESET_ARMIES).map(([id, p]) => new Option(p.name, id)));

// La práctica se simula en el navegador con el mismo motor que usa el servidor.
$('simulate').onclick = () => {
  const preset = PRESET_ARMIES[opponentSelect.value];
  playBattle(simulate(currentArmy(), preset.army), 0, ['Tu ejército', preset.name]);
};
$('edit').onclick = () => { stopReplay(); setStatus('Ajusta tu ejército y vuelve a probar.'); refresh(); };
$('clear').onclick = () => { stopReplay(); placements = []; refresh(); };

// ---------- Torneos ----------

const playerInput = $<HTMLInputElement>('player');
try { playerInput.value = localStorage.getItem('bastion.player') ?? ''; } catch { /* almacenamiento no disponible */ }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json' } });
  const body = await res.json().catch(() => ({ error: `Error ${res.status}` }));
  if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
  return body as T;
}

interface TournamentView {
  id: string; name: string; status: string; closesAt: string; entryFee: number; pool: number; entryCount: number;
  result?: { standings: Array<{ id: string; rank: number; points: number; wins: number; draws: number; losses: number }>; plan: { payouts: Array<{ id: string; amount: number }> } };
}

const usdc = (units: number) => `${(units / 1_000_000).toLocaleString('es', { maximumFractionDigits: 2 })} USDC`;

$('submit').onclick = async () => {
  const out = $('submit-status');
  const playerId = playerInput.value.trim();
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
      const when = new Date(t.closesAt).toLocaleString('es');
      div.innerHTML = `<strong>${escapeHtml(t.name)}</strong><br>
        ${t.status === 'closed' ? 'Cerrado' : `Cierra ${when}`} · ${t.entryCount} inscritos · Pozo ${usdc(t.pool)}
        ${t.entryFee ? ` · Entrada ${usdc(t.entryFee)}` : ' · Gratis'}`;
      if (t.status === 'closed') {
        const b = document.createElement('button');
        b.textContent = 'Ver clasificación';
        b.onclick = () => showStandings(t.id, div);
        div.append(document.createElement('br'), b);
      }
      div.style.marginBottom = '10px';
      return div;
    }));
  } catch {
    box.textContent = 'Servidor no disponible. La práctica contra la IA funciona igualmente.';
  }
}

async function showStandings(id: string, container: HTMLElement): Promise<void> {
  const t = await api<TournamentView>(`/api/tournaments/${id}`);
  if (!t.result) return;
  const prize = new Map(t.result.plan.payouts.map((p) => [p.id, p.amount]));
  const table = document.createElement('table');
  table.innerHTML = '<tr><th>#</th><th>Jugador</th><th class="num">Pts</th><th class="num">Premio</th></tr>';
  for (const s of t.result.standings.slice(0, 10)) {
    const tr = table.insertRow();
    tr.innerHTML = `<td>${s.rank}</td><td>${escapeHtml(s.id)}</td><td class="num">${s.points}</td><td class="num">${prize.has(s.id) ? usdc(prize.get(s.id)!) : ''}</td>`;
    tr.style.cursor = 'pointer';
    tr.title = 'Ver repetición contra el primer clasificado';
    tr.onclick = async () => {
      const leader = t.result!.standings[0].id;
      const rival = s.id === leader ? t.result!.standings[1]?.id : leader;
      if (!rival) return;
      const result = await api<BattleResult>(`/api/tournaments/${id}/replay?left=${encodeURIComponent(s.id)}&right=${encodeURIComponent(rival)}`);
      playBattle(result, 0, [s.id, rival]);
    };
  }
  container.append(table);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

setupCanvas();
renderPalette();
refresh();
loadTournaments();
