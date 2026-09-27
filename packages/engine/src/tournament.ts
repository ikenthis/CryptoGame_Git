import type { Army } from './army.ts';
import { simulate } from './battle.ts';

export interface TournamentEntry {
  id: string;
  army: Army;
}

export interface Standing {
  id: string;
  /** Posición (1 = primero). Empates exactos de puntos y margen comparten posición. */
  rank: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  /** Suma de diferencias de valor restante; desempata a igualdad de puntos. */
  margin: number;
}

export interface MatchSummary {
  left: string;
  right: string;
  winner: string | null;
  turns: number;
}

export const POINTS = { win: 3, draw: 1, loss: 0 } as const;

/**
 * Todos contra todos, dos partidas por pareja (cada ejército juega una vez en
 * cada lado) para anular cualquier ventaja de posición o de iniciativa.
 * Coste: N·(N-1) simulaciones. Para más de ~500 inscritos conviene pasar a
 * rondas suizas (ver docs/GDD.md).
 */
export function runTournament(entries: TournamentEntry[]): { standings: Standing[]; matches: MatchSummary[] } {
  const table = new Map<string, Omit<Standing, 'rank'>>();
  for (const e of entries) {
    if (table.has(e.id)) throw new Error(`Inscripción duplicada: ${e.id}`);
    table.set(e.id, { id: e.id, points: 0, wins: 0, draws: 0, losses: 0, margin: 0 });
  }
  const matches: MatchSummary[] = [];

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      for (const [left, right] of [[entries[i], entries[j]], [entries[j], entries[i]]]) {
        const result = simulate(left.army, right.army, { record: false });
        const l = table.get(left.id)!;
        const r = table.get(right.id)!;
        const diff = result.score[0] - result.score[1];
        l.margin += diff;
        r.margin -= diff;
        if (result.winner === null) {
          l.draws++; r.draws++;
          l.points += POINTS.draw; r.points += POINTS.draw;
        } else {
          const [w, lo] = result.winner === 0 ? [l, r] : [r, l];
          w.wins++; lo.losses++;
          w.points += POINTS.win;
        }
        const winner = result.winner === null ? null : result.winner === 0 ? left.id : right.id;
        matches.push({ left: left.id, right: right.id, winner, turns: result.turns });
      }
    }
  }

  // Orden estable: a igualdad total se mantiene el orden de inscripción.
  const sorted = [...table.values()].sort((a, b) => b.points - a.points || b.margin - a.margin);
  const standings: Standing[] = [];
  for (const [i, s] of sorted.entries()) {
    const prev = standings[i - 1];
    const tied = prev && prev.points === s.points && prev.margin === s.margin;
    standings.push({ ...s, rank: tied ? prev.rank : i + 1 });
  }
  return { standings, matches };
}
