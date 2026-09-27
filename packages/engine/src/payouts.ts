import type { Standing } from './tournament.ts';

// Reparto de premios con enteros (unidades mínimas del token, p. ej. 1 USDC =
// 1_000_000). Garantía: comisión + suma de premios === pozo, sin redondeos
// perdidos. El contrato TournamentEscrow exige esa misma igualdad.

export interface PayoutPlan {
  fee: number;
  payouts: Array<{ id: string; amount: number }>;
}

export const MAX_FEE_BPS = 1500;
/** Reparto por defecto: 50% / 30% / 20% entre los tres primeros. */
export const DEFAULT_SHARES_BPS = [5000, 3000, 2000];

export function computePayouts(
  pool: number,
  feeBps: number,
  standings: Standing[],
  sharesBps: number[] = DEFAULT_SHARES_BPS,
): PayoutPlan {
  if (!Number.isSafeInteger(pool) || pool < 0) throw new Error('El pozo debe ser un entero no negativo.');
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > MAX_FEE_BPS) throw new Error(`Comisión fuera de rango (máx ${MAX_FEE_BPS} bps).`);
  if (sharesBps.some((s) => !Number.isInteger(s) || s < 0) || sharesBps.reduce((a, b) => a + b, 0) !== 10_000) {
    throw new Error('Los repartos deben sumar 10000 bps.');
  }
  if (standings.length === 0) return { fee: 0, payouts: [] };

  const fee = Math.floor((pool * feeBps) / 10_000);
  const net = pool - fee;

  // Si hay menos inscritos que puestos premiados, se reescalan los puestos existentes.
  const shares = sharesBps.slice(0, standings.length);
  const totalShares = shares.reduce((a, b) => a + b, 0);
  const byPosition = shares.map((s) => Math.floor((net * s) / totalShares));
  byPosition[0] += net - byPosition.reduce((a, b) => a + b, 0);

  // Los empatados reparten a partes iguales la suma de los puestos que ocupan.
  const payouts: PayoutPlan['payouts'] = [];
  for (let start = 0; start < standings.length && start < byPosition.length; ) {
    let end = start + 1;
    while (end < standings.length && standings[end].rank === standings[start].rank) end++;
    const group = standings.slice(start, end);
    const amount = byPosition.slice(start, end).reduce((a, b) => a + b, 0);
    const each = Math.floor(amount / group.length);
    for (const [k, s] of group.entries()) {
      const extra = k === 0 ? amount - each * group.length : 0;
      if (each + extra > 0) payouts.push({ id: s.id, amount: each + extra });
    }
    start = end;
  }
  return { fee, payouts };
}
