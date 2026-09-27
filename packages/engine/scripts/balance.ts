// Informe de balance. Uso: node packages/engine/scripts/balance.ts
//  1) Ejércitos de referencia (con cartas) todos contra todos.
//  2) Razas: el mismo ejército y sin cartas, solo cambia la raza.
//  3) Cartas: un ejército estándar con una sola carta en el turno 2 frente al
//     mismo ejército sin cartas, jugando con todas las razas.
import {
  CARD_IDS, CARDS, COMMANDERS, COMMANDER_IDS, PRESET_ARMIES, RACE_IDS, runTournament, simulate, validateArmy, type Army, type Placement,
} from '../src/index.ts';

const check = (id: string, army: Army) => {
  const r = validateArmy(army);
  if (!r.ok) throw new Error(`${id}: ${r.error}`);
  return { id, army: r.army };
};

console.log('\n== Ejércitos de referencia ==');
console.table(runTournament(Object.entries(PRESET_ARMIES).map(([id, p]) => check(id, p.army))).standings);

const standard: Placement[] = [
  { type: 'guardian', x: 2, y: 2 },
  { type: 'warrior', x: 2, y: 3 },
  { type: 'archer', x: 0, y: 2 },
  { type: 'knight', x: 1, y: 4 },
];
const firstCommander = (race: Army['race']) => COMMANDER_IDS.find((id) => COMMANDERS[id].race === race)!;
const lead = (race: Army['race'], id = firstCommander(race)): Army['commander'] => ({ id, x: 0, y: 4 });

console.log('\n== Razas (mismo ejército y comandante común, sin cartas) ==');
console.table(runTournament(RACE_IDS.map((race) => check(race, { race, commander: lead(race), units: standard }))).standings);

console.log('\n== Comandantes (mismo ejército, sin cartas) ==');
console.table(runTournament(COMMANDER_IDS.map((id) => check(id, { race: COMMANDERS[id].race, commander: lead(COMMANDERS[id].race, id), units: standard }))).standings
  .map((s) => ({ ...s, rarity: COMMANDERS[s.id as keyof typeof COMMANDERS].rarity })));

console.log('\n== Cartas (victorias sobre 2·razas partidas contra el mismo ejército sin carta) ==');
const rows = CARD_IDS.map((card) => {
  let wins = 0;
  let games = 0;
  for (const race of RACE_IDS) {
    if (CARDS[card].race && CARDS[card].race !== race) continue;
    const withCard: Army = { race, commander: lead(race), units: standard, cards: [{ card, turn: 2 }] };
    const without: Army = { race, commander: lead(race), units: standard };
    for (const [l, r, mine] of [[withCard, without, 0], [without, withCard, 1]] as const) {
      games++;
      if (simulate(l, r, { record: false }).winner === mine) wins++;
    }
  }
  return { card, rarity: CARDS[card].rarity, cost: CARDS[card].cost, winRate: `${Math.round((100 * wins) / games)}%` };
});
console.table(rows);
