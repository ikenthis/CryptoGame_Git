import { BOARD_HEIGHT, BUDGET, DEPLOY_COLUMNS, MAX_UNITS, UNITS, isUnitType, type UnitType } from './rules.ts';

/**
 * Posición de despliegue en coordenadas propias: x = 0 es la retaguardia y
 * x = DEPLOY_COLUMNS - 1 la primera línea. El motor refleja al lado derecho.
 */
export interface Placement {
  type: UnitType;
  x: number;
  y: number;
}

export interface Army {
  units: Placement[];
}

export type ValidationResult = { ok: true; army: Army; cost: number } | { ok: false; error: string };

/** Valida datos no confiables (p. ej. un body HTTP) y devuelve un ejército normalizado. */
export function validateArmy(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null || !Array.isArray((input as Army).units)) {
    return { ok: false, error: 'El ejército debe tener una lista "units".' };
  }
  const raw = (input as Army).units;
  if (raw.length === 0) return { ok: false, error: 'Despliega al menos una unidad.' };
  if (raw.length > MAX_UNITS) return { ok: false, error: `Máximo ${MAX_UNITS} unidades.` };

  const units: Placement[] = [];
  const occupied = new Set<string>();
  let cost = 0;
  for (const [i, u] of raw.entries()) {
    if (typeof u !== 'object' || u === null) return { ok: false, error: `Unidad ${i} inválida.` };
    const { type, x, y } = u as Placement;
    if (!isUnitType(type)) return { ok: false, error: `Unidad ${i}: tipo desconocido.` };
    if (!Number.isInteger(x) || x < 0 || x >= DEPLOY_COLUMNS || !Number.isInteger(y) || y < 0 || y >= BOARD_HEIGHT) {
      return { ok: false, error: `Unidad ${i}: fuera de tu zona de despliegue.` };
    }
    const key = `${x},${y}`;
    if (occupied.has(key)) return { ok: false, error: `Unidad ${i}: casilla ocupada.` };
    occupied.add(key);
    cost += UNITS[type].cost;
    units.push({ type, x, y });
  }
  if (cost > BUDGET) return { ok: false, error: `Coste ${cost} supera el presupuesto de ${BUDGET}.` };
  return { ok: true, army: { units }, cost };
}

export function armyCost(army: Army): number {
  return army.units.reduce((sum, u) => sum + UNITS[u.type].cost, 0);
}

/**
 * Serialización canónica (orden estable) para calcular compromisos/hashes:
 * dos ejércitos equivalentes producen exactamente el mismo texto.
 */
export function canonicalArmy(army: Army): string {
  const sorted = [...army.units].sort((a, b) => a.x - b.x || a.y - b.y || a.type.localeCompare(b.type));
  return sorted.map((u) => `${u.type}@${u.x},${u.y}`).join(';');
}
