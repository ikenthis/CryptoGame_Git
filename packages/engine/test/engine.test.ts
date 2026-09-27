import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BUDGET, MAX_TURNS, PRESET_ARMIES, UNITS, canonicalArmy, computePayouts, runTournament, simulate, validateArmy,
  type Army, type Standing,
} from '../src/index.ts';

const horde = PRESET_ARMIES.horde.army;
const wall = PRESET_ARMIES.wall.army;

describe('validateArmy', () => {
  it('acepta todos los presets', () => {
    for (const { army } of Object.values(PRESET_ARMIES)) assert.equal(validateArmy(army).ok, true);
  });

  it('rechaza presupuesto excedido, casillas repetidas y fuera de zona', () => {
    const overBudget: Army = { units: [0, 1, 2, 3].map((y) => ({ type: 'knight', x: 0, y })) };
    assert.equal(4 * UNITS.knight.cost > BUDGET, true);
    assert.equal(validateArmy(overBudget).ok, false);
    assert.equal(validateArmy({ units: [{ type: 'warrior', x: 0, y: 0 }, { type: 'archer', x: 0, y: 0 }] }).ok, false);
    assert.equal(validateArmy({ units: [{ type: 'warrior', x: 3, y: 0 }] }).ok, false);
    assert.equal(validateArmy({ units: [{ type: 'warrior', x: 0.5, y: 0 }] }).ok, false);
    assert.equal(validateArmy({ units: [{ type: 'dragon', x: 0, y: 0 }] }).ok, false);
    assert.equal(validateArmy({ units: [] }).ok, false);
    assert.equal(validateArmy(null).ok, false);
  });

  it('descarta campos extra al normalizar', () => {
    const result = validateArmy({ units: [{ type: 'warrior', x: 0, y: 0, hp: 999 }] });
    assert.ok(result.ok);
    assert.deepEqual(result.army, { units: [{ type: 'warrior', x: 0, y: 0 }] });
  });
});

describe('simulate', () => {
  it('es determinista', () => {
    assert.deepEqual(simulate(horde, wall), simulate(horde, wall));
  });

  it('refleja al lado derecho del tablero', () => {
    const r = simulate(horde, wall);
    assert.ok(r.initial.filter((u) => u.side === 0).every((u) => u.x === 2));
    assert.ok(r.initial.filter((u) => u.side === 1).every((u) => u.x >= 5));
  });

  it('termina por eliminación con ganador válido', () => {
    const r = simulate(horde, wall);
    assert.equal(r.reason, 'elimination');
    assert.notEqual(r.winner, null);
    const last = r.frames.at(-1)!;
    assert.ok(last.units.every((u) => u.side === r.winner));
  });

  it('respeta el límite de turnos cuando nadie puede hacer daño', () => {
    const healers: Army = { units: [{ type: 'healer', x: 0, y: 0 }] };
    const r = simulate(healers, healers);
    assert.equal(r.reason, 'timeout');
    assert.equal(r.turns, MAX_TURNS);
    assert.equal(r.winner, null);
  });

  it('nunca solapa dos unidades en la misma casilla', () => {
    for (const a of Object.values(PRESET_ARMIES)) {
      for (const b of Object.values(PRESET_ARMIES)) {
        for (const frame of simulate(a.army, b.army).frames) {
          const cells = frame.units.map((u) => `${u.x},${u.y}`);
          assert.equal(new Set(cells).size, cells.length);
        }
      }
    }
  });

  it('aplica la carga del caballero solo si se movió', () => {
    const knight: Army = { units: [{ type: 'knight', x: 2, y: 0 }] };
    const dummy: Army = { units: [{ type: 'warrior', x: 2, y: 0 }] };
    const hit = simulate(knight, dummy).frames[0].events.find((e) => e.kind === 'attack' && e.id === 0);
    assert.ok(hit && hit.kind === 'attack');
    assert.equal(hit.charge, true);
    assert.equal(hit.damage, UNITS.knight.attack + UNITS.knight.chargeBonus);
  });

  it('el sanador cura sin superar la vida máxima', () => {
    const r = simulate(PRESET_ARMIES.arcane.army, horde);
    const heals = r.frames.flatMap((f) => f.events).filter((e) => e.kind === 'heal');
    assert.ok(heals.length > 0);
    for (const f of r.frames) for (const u of f.units) assert.ok(u.hp <= UNITS[u.type].hp);
  });
});

describe('runTournament', () => {
  it('dos ejércitos idénticos empatan a puntos al jugar ambos lados', () => {
    const { standings } = runTournament([{ id: 'a', army: horde }, { id: 'b', army: horde }]);
    assert.equal(standings[0].points, standings[1].points);
    assert.equal(standings[0].rank, standings[1].rank);
  });

  it('cada pareja juega dos veces y los puntos cuadran', () => {
    const entries = Object.entries(PRESET_ARMIES).map(([id, p]) => ({ id, army: p.army }));
    const { standings, matches } = runTournament(entries);
    const n = entries.length;
    assert.equal(matches.length, n * (n - 1));
    const games = standings.reduce((s, x) => s + x.wins + x.draws + x.losses, 0);
    assert.equal(games, 2 * matches.length);
    assert.equal(standings.reduce((s, x) => s + x.margin, 0), 0);
    for (let i = 1; i < standings.length; i++) assert.ok(standings[i - 1].points >= standings[i].points);
  });

  it('rechaza inscripciones duplicadas', () => {
    assert.throws(() => runTournament([{ id: 'a', army: horde }, { id: 'a', army: wall }]));
  });
});

describe('computePayouts', () => {
  const standing = (id: string, rank: number): Standing => ({ id, rank, points: 0, wins: 0, draws: 0, losses: 0, margin: 0 });

  it('comisión + premios suman exactamente el pozo', () => {
    const plan = computePayouts(1_000_003, 1000, ['a', 'b', 'c', 'd'].map((id, i) => standing(id, i + 1)));
    assert.equal(plan.fee, 100_000);
    assert.equal(plan.fee + plan.payouts.reduce((s, p) => s + p.amount, 0), 1_000_003);
    assert.deepEqual(plan.payouts.map((p) => p.id), ['a', 'b', 'c']);
  });

  it('los empatados reparten a partes iguales', () => {
    const plan = computePayouts(1_000_000, 0, [standing('a', 1), standing('b', 1), standing('c', 3)]);
    assert.deepEqual(plan.payouts, [
      { id: 'a', amount: 400_000 },
      { id: 'b', amount: 400_000 },
      { id: 'c', amount: 200_000 },
    ]);
  });

  it('reescala si hay menos inscritos que puestos premiados', () => {
    const plan = computePayouts(800_000, 0, [standing('a', 1), standing('b', 2)]);
    assert.deepEqual(plan.payouts, [{ id: 'a', amount: 500_000 }, { id: 'b', amount: 300_000 }]);
  });

  it('rechaza comisiones abusivas', () => {
    assert.throws(() => computePayouts(100, 5000, [standing('a', 1)]));
  });
});

describe('canonicalArmy', () => {
  it('no depende del orden de las unidades', () => {
    const reversed: Army = { units: [...wall.units].reverse() };
    assert.equal(canonicalArmy(wall), canonicalArmy(reversed));
  });
});
