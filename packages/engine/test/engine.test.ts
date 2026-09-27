import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BUDGET, CARDS, CARD_IDS, MAX_TURNS, PRESET_ARMIES, RACE_IDS, UNITS, canonicalArmy, cardsForRace, computePayouts,
  runTournament, simulate, statsFor, validateArmy,
  type Army, type BattleEvent, type BattleResult, type Standing,
} from '../src/index.ts';

const horde = PRESET_ARMIES.horde.army;
const wall = PRESET_ARMIES.wall.army;
const presets = Object.values(PRESET_ARMIES).map((p) => p.army);
const events = (r: BattleResult): BattleEvent[] => r.frames.flatMap((f) => f.events);
const lone = (race: Army['race'], type: Army['units'][0]['type'], extra: Partial<Army> = {}): Army => ({
  race, units: [{ type, x: 2, y: 0 }], ...extra,
});

describe('validateArmy', () => {
  it('acepta todos los presets', () => {
    for (const army of presets) assert.equal(validateArmy(army).ok, true);
  });

  it('rechaza presupuesto excedido, casillas repetidas, fuera de zona y raza inválida', () => {
    const overBudget: Army = { race: 'human', units: [0, 1, 2, 3].map((y) => ({ type: 'knight', x: 0, y })) };
    assert.equal(4 * UNITS.knight.cost > BUDGET, true);
    assert.equal(validateArmy(overBudget).ok, false);
    assert.equal(validateArmy({ race: 'elf', units: [{ type: 'warrior', x: 0, y: 0 }, { type: 'archer', x: 0, y: 0 }] }).ok, false);
    assert.equal(validateArmy({ race: 'elf', units: [{ type: 'warrior', x: 3, y: 0 }] }).ok, false);
    assert.equal(validateArmy({ race: 'elf', units: [{ type: 'warrior', x: 0.5, y: 0 }] }).ok, false);
    assert.equal(validateArmy({ race: 'elf', units: [{ type: 'dragon', x: 0, y: 0 }] }).ok, false);
    assert.equal(validateArmy({ race: 'gnome', units: [{ type: 'warrior', x: 0, y: 0 }] }).ok, false);
    assert.equal(validateArmy({ race: 'elf', units: [] }).ok, false);
    assert.equal(validateArmy(null).ok, false);
  });

  it('no permite comprar unidades que solo se invocan', () => {
    assert.equal(validateArmy(lone('dwarf', 'golem')).ok, false);
  });

  it('valida las cartas: energía, legendarias, raza, repetidas y turno', () => {
    const base = { race: 'human' as const, units: [{ type: 'warrior' as const, x: 0, y: 0 }] };
    assert.equal(validateArmy({ ...base, cards: [{ card: 'meteor', turn: 1 }, { card: 'chain-lightning', turn: 2 }] }).ok, false, 'energía');
    assert.equal(validateArmy({ ...base, cards: [{ card: 'sylvaran-storm', turn: 1 }] }).ok, false, 'raza');
    assert.equal(validateArmy({ ...base, cards: [{ card: 'fire-arrow', turn: 1 }, { card: 'fire-arrow', turn: 2 }] }).ok, false, 'repetida');
    assert.equal(validateArmy({ ...base, cards: [{ card: 'fire-arrow', turn: 0 }] }).ok, false, 'turno');
    assert.equal(validateArmy({ ...base, cards: [{ card: 'nope', turn: 1 }] }).ok, false, 'desconocida');
    assert.equal(validateArmy({ ...base, cards: [{ card: 'aurelia-intervention', turn: 3 }, { card: 'fire-arrow', turn: 1 }] }).ok, true);
  });

  it('descarta campos extra al normalizar', () => {
    const result = validateArmy({ race: 'elf', units: [{ type: 'warrior', x: 0, y: 0, hp: 999 }], gold: 1e9 });
    assert.ok(result.ok);
    assert.deepEqual(result.army, { race: 'elf', units: [{ type: 'warrior', x: 0, y: 0 }], cards: [] });
  });
});

describe('razas y cartas', () => {
  it('cada raza tiene exactamente una legendaria propia', () => {
    for (const race of RACE_IDS) {
      assert.equal(cardsForRace(race).filter((c) => c.rarity === 'legendary').length, 1, race);
    }
    for (const id of CARD_IDS) assert.equal(CARDS[id].id, id);
  });

  it('aplica los modificadores de raza', () => {
    assert.equal(statsFor('archer', 'elf').range, UNITS.archer.range + 1);
    assert.equal(statsFor('archer', 'orc').range, UNITS.archer.range - 1);
    assert.equal(statsFor('guardian', 'dwarf').armor, UNITS.guardian.armor + 1);
    assert.deepEqual(statsFor('mage', 'human'), UNITS.mage);
  });

  it('los no-muertos se levantan una sola vez por batalla', () => {
    const undead: Army = { race: 'undead', units: [{ type: 'warrior', x: 2, y: 0 }, { type: 'warrior', x: 2, y: 1 }] };
    const r = simulate(undead, horde);
    const rises = events(r).filter((e) => e.kind === 'rise');
    assert.equal(rises.length, 1);
    assert.equal(r.races[0], 'undead');
  });

  it('Flecha Ígnea golpea al enemigo con menos vida', () => {
    const r = simulate(lone('elf', 'warrior', { cards: [{ card: 'fire-arrow', turn: 1 }] }), {
      race: 'elf', units: [{ type: 'guardian', x: 0, y: 0 }, { type: 'archer', x: 0, y: 5 }],
    });
    const spell = r.frames[0].events.find((e) => e.kind === 'spell');
    assert.ok(spell && spell.kind === 'spell');
    const archer = r.initial.find((u) => u.side === 1 && u.type === 'archer')!;
    assert.equal(spell.target, archer.id);
    assert.equal(spell.damage, 3);
  });

  it('Cadenas de Escarcha deja al objetivo sin actuar', () => {
    const r = simulate(lone('elf', 'guardian', { cards: [{ card: 'frost-bind', turn: 1 }] }), lone('elf', 'knight'));
    const knight = r.initial.find((u) => u.side === 1)!;
    for (const f of r.frames.slice(0, 2)) {
      assert.ok(!f.events.some((e) => 'id' in e && e.id === knight.id && e.kind !== 'stun'), `turno ${f.turn}`);
    }
    assert.ok(r.frames[0].units.find((u) => u.id === knight.id)!.status.includes('stunned'));
  });

  it('Gólem Ancestral invoca una unidad nueva en la retaguardia', () => {
    const r = simulate(lone('dwarf', 'warrior', { cards: [{ card: 'ancestral-golem', turn: 1 }] }), lone('dwarf', 'warrior'));
    const summon = r.frames[0].events.find((e) => e.kind === 'summon');
    assert.ok(summon && summon.kind === 'summon');
    assert.equal(summon.type, 'golem');
    assert.equal(summon.x, 0);
    assert.equal(summon.hp, statsFor('golem', 'dwarf').hp);
  });

  it('Resurrección revive a la unidad caída más valiosa, y falla si no hay caídos', () => {
    const early = simulate(lone('human', 'warrior', { cards: [{ card: 'resurrection', turn: 1 }] }), lone('human', 'warrior'));
    const card = early.frames[0].events.find((e) => e.kind === 'card');
    assert.ok(card && card.kind === 'card' && card.fizzled);

    const army: Army = {
      race: 'human',
      units: [{ type: 'archer', x: 2, y: 2 }, { type: 'guardian', x: 0, y: 0 }],
      cards: [{ card: 'resurrection', turn: 2 }],
    };
    const r = simulate(army, PRESET_ARMIES.cavalry.army);
    const archer = r.initial.find((u) => u.side === 0 && u.type === 'archer')!;
    assert.ok(r.frames[0].events.some((e) => e.kind === 'death' && e.id === archer.id), 'el arquero cae en el turno 1');
    const revive = r.frames[1].events.find((e) => e.kind === 'revive');
    assert.ok(revive && revive.kind === 'revive');
    assert.equal(revive.id, archer.id);
    assert.equal(revive.hp, Math.ceil(UNITS.archer.hp / 2));
  });

  it('las mejoras caducan', () => {
    const r = simulate(lone('orc', 'guardian', { cards: [{ card: 'war-cry', turn: 1 }] }), lone('orc', 'healer'));
    const status = (turn: number) => r.frames[turn - 1].units.find((u) => u.side === 0)!.status;
    assert.ok(status(1).includes('attack'));
    assert.ok(!status(2).includes('attack'));
  });
});

describe('simulate', () => {
  it('es determinista', () => {
    for (const a of presets) assert.deepEqual(simulate(a, wall), simulate(a, wall));
  });

  it('refleja al lado derecho del tablero', () => {
    const r = simulate(horde, wall);
    assert.ok(r.initial.filter((u) => u.side === 0).every((u) => u.x === 2));
    assert.ok(r.initial.filter((u) => u.side === 1).every((u) => u.x >= 5));
  });

  it('termina por eliminación con ganador válido', () => {
    const r = simulate(horde, PRESET_ARMIES.volley.army);
    assert.equal(r.reason, 'elimination');
    assert.notEqual(r.winner, null);
    assert.ok(r.frames.at(-1)!.units.every((u) => u.side === r.winner));
  });

  it('respeta el límite de turnos cuando nadie puede hacer daño', () => {
    const healers = lone('human', 'healer');
    const r = simulate(healers, healers);
    assert.equal(r.reason, 'timeout');
    assert.equal(r.turns, MAX_TURNS);
    assert.equal(r.winner, null);
  });

  it('nunca solapa unidades ni supera la vida máxima, con cartas e invocaciones', () => {
    for (const a of presets) {
      for (const b of presets) {
        for (const frame of simulate(a, b).frames) {
          const cells = frame.units.map((u) => `${u.x},${u.y}`);
          assert.equal(new Set(cells).size, cells.length);
          for (const u of frame.units) assert.ok(u.hp > 0 && u.hp <= u.maxHp);
        }
      }
    }
  });

  it('aplica la carga del caballero solo si se movió', () => {
    const r = simulate(lone('elf', 'knight'), lone('elf', 'warrior'));
    const hit = r.frames[0].events.find((e) => e.kind === 'attack' && e.id === 0);
    assert.ok(hit && hit.kind === 'attack');
    assert.equal(hit.charge, true);
    assert.equal(hit.damage, UNITS.knight.attack + UNITS.knight.chargeBonus);
  });

  it('el sanador cura sin superar la vida máxima', () => {
    const r = simulate(PRESET_ARMIES.arcane.army, horde);
    assert.ok(events(r).some((e) => e.kind === 'heal' && e.id !== null));
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
  it('no depende del orden de unidades ni cartas, pero sí de raza y turnos', () => {
    const reversed: Army = { ...wall, units: [...wall.units].reverse(), cards: [...wall.cards!].reverse() };
    assert.equal(canonicalArmy(wall), canonicalArmy(reversed));
    assert.notEqual(canonicalArmy(wall), canonicalArmy({ ...wall, race: 'human' }));
    assert.notEqual(canonicalArmy(wall), canonicalArmy({ ...wall, cards: [{ card: 'fire-arrow', turn: 9 }] }));
  });
});
