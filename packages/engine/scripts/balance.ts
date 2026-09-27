// Informe de balance: enfrenta los ejércitos de referencia todos contra todos.
// Uso: node packages/engine/scripts/balance.ts
import { PRESET_ARMIES, runTournament, validateArmy } from '../src/index.ts';

const entries = Object.entries(PRESET_ARMIES).map(([id, { army }]) => {
  const check = validateArmy(army);
  if (!check.ok) throw new Error(`${id}: ${check.error}`);
  return { id, army };
});
const { standings, matches } = runTournament(entries);
console.table(standings);
console.table(matches);
