import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CARDS, COMMANDERS, MAX_SUPPLIES, MISSIONS, PACKS, PRESET_ARMIES, SUPPLY_EVERY_MS,
  buyOffer, craft, distill, finishMission, merchantOffers, missionById, missionUnlocked, mulberry32, newProfile, openPack,
  refreshSupplies, simulate, startMission, transmute, validateArmy,
  type BattleResult,
} from '../src/index.ts';

const T0 = 1_800_000_000_000;

describe('perfil y provisiones', () => {
  it('empieza con las comunes, un comandante por raza y recursos iniciales', () => {
    const p = newProfile(T0);
    assert.ok(Object.keys(p.cards).every((id) => CARDS[id as keyof typeof CARDS].rarity === 'common'));
    const races = new Set(Object.keys(p.commanders).map((id) => COMMANDERS[id as keyof typeof COMMANDERS].race));
    assert.equal(races.size, 5);
    assert.equal(p.resources.supplies, MAX_SUPPLIES);
  });

  it('recupera provisiones con el tiempo sin pasar del máximo', () => {
    let p = newProfile(T0);
    p = startMission(p, 'vado', T0);
    assert.equal(p.resources.supplies, MAX_SUPPLIES - 1);
    assert.equal(refreshSupplies(p, T0 + SUPPLY_EVERY_MS - 1).resources.supplies, MAX_SUPPLIES - 1);
    assert.equal(refreshSupplies(p, T0 + SUPPLY_EVERY_MS * 5).resources.supplies, MAX_SUPPLIES);
  });
});

describe('campaña', () => {
  it('bloquea misiones hasta completar la anterior', () => {
    const p = newProfile(T0);
    assert.equal(missionUnlocked(p, missionById('vado')), true);
    assert.equal(missionUnlocked(p, missionById('torre')), false);
    assert.throws(() => startMission(p, 'torre', T0));
  });

  it('da la recompensa de primera victoria una sola vez', () => {
    const p0 = newProfile(T0);
    const win = { winner: 0, bossDamage: 0, bossHp: 0 } as BattleResult;
    const first = finishMission(p0, 'vado', win);
    assert.equal(first.profile.resources.tokens, p0.resources.tokens + 5);
    assert.ok(first.profile.cleared.includes('vado'));
    const second = finishMission(first.profile, 'vado', win);
    assert.equal(second.profile.resources.tokens, first.profile.resources.tokens);
    assert.equal(second.profile.resources.gold, first.profile.resources.gold + 20);
  });

  it('la primera misión se puede ganar con un ejército inicial', () => {
    const army = { ...PRESET_ARMIES.cavalry.army, cards: [] };
    assert.ok(validateArmy(army).ok);
    assert.equal(simulate(army, missionById('vado').enemy).winner, 0);
  });

  it('las incursiones premian según el daño al jefe', () => {
    const p = newProfile(T0);
    const half = finishMission(p, 'guarida', { winner: 1, bossDamage: 35, bossHp: 70 } as BattleResult);
    assert.equal(half.damagePct, 50);
    assert.equal(half.profile.resources.tokens, p.resources.tokens + 2 + 5);
    const real = simulate(PRESET_ARMIES.wall.army, missionById('guarida').enemy);
    assert.ok(real.bossDamage > 0 && real.bossHp > 0);
  });

  it('todas las misiones tienen un ejército enemigo que se puede simular', () => {
    for (const m of MISSIONS) assert.doesNotThrow(() => simulate(PRESET_ARMIES.horde.army, m.enemy, { record: false }), m.id);
  });
});

describe('sobres y mercado negro', () => {
  it('las probabilidades publicadas suman 100 %', () => {
    for (const pack of Object.values(PACKS)) assert.equal(Object.values(pack.odds).reduce((a, b) => a + b, 0), 100);
  });

  it('abrir un sobre cuesta fichas y es reproducible con la misma semilla', () => {
    const p = newProfile(T0);
    const a = openPack(p, 'war', mulberry32(42));
    const b = openPack(p, 'war', mulberry32(42));
    assert.deepEqual(a.cards, b.cards);
    assert.equal(a.cards.length, 3);
    assert.equal(a.profile.resources.tokens, p.resources.tokens - 5);
    assert.throws(() => openPack(p, 'commander', mulberry32(1)), /recursos/);
  });

  it('la distribución de rarezas se acerca a la publicada', () => {
    let p = newProfile(T0);
    p.resources.tokens = 5 * 2000;
    const counts: Record<string, number> = {};
    const rng = mulberry32(7);
    for (let i = 0; i < 2000; i++) {
      const r = openPack(p, 'war', rng);
      p = r.profile;
      for (const c of r.cards) counts[CARDS[c].rarity] = (counts[CARDS[c].rarity] ?? 0) + 1;
    }
    const total = 6000;
    assert.ok(Math.abs(counts.common / total - 0.6) < 0.03);
    assert.ok(Math.abs((counts.legendary ?? 0) / total - 0.01) < 0.01);
  });

  it('transmuta 3 comunes en una poco común y valida las entradas', () => {
    let p = newProfile(T0);
    p.cards['fire-arrow'] = 3;
    const r = transmute(p, ['fire-arrow', 'fire-arrow', 'fire-arrow'], mulberry32(3));
    assert.equal(CARDS[r.card].rarity, 'uncommon');
    assert.equal(r.profile.cards['fire-arrow'], 0);
    assert.throws(() => transmute(p, ['fire-arrow', 'fire-arrow'], mulberry32(3)));
    assert.throws(() => transmute(p, ['fire-arrow', 'fire-arrow', 'meteor'], mulberry32(3)));
    p = newProfile(T0);
    assert.throws(() => transmute(p, ['fire-arrow', 'fire-arrow', 'fire-arrow'], mulberry32(3)), /copias/);
  });

  it('destila repetidas en esencia y fabrica con ella', () => {
    let p = newProfile(T0);
    assert.throws(() => distill(p, 'fire-arrow'), /repetidas/);
    p.cards['fire-arrow'] = 5;
    for (let i = 0; i < 4; i++) p = distill(p, 'fire-arrow');
    assert.equal(p.resources.essence, 20);
    p = craft(p, 'minor-potion');
    assert.equal(p.cards['minor-potion'], 2);
    assert.equal(p.resources.essence, 0);
  });

  it('el mercader ofrece 4 ofertas deterministas por día y cada una se compra una vez', () => {
    assert.deepEqual(merchantOffers('2026-10-01').map((o) => o.id), merchantOffers('2026-10-01').map((o) => o.id));
    assert.equal(new Set(merchantOffers('2026-10-01').map((o) => o.id)).size, 4);
    let p = newProfile(T0);
    p.resources = { ...p.resources, gold: 1000, iron: 100, crystal: 100, bone: 100 };
    const offer = merchantOffers('2026-10-01')[0];
    p = buyOffer(p, '2026-10-01', offer.id);
    assert.throws(() => buyOffer(p, '2026-10-01', offer.id), /Ya compraste/);
  });
});
