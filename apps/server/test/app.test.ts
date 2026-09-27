import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { PRESET_ARMIES } from '@gentium/engine';
import { createApp } from '../src/app.ts';
import { TournamentStore, commitmentFor } from '../src/store.ts';

const ADMIN = 'test-token';
let clock = new Date('2026-01-01T12:00:00Z');
const server = createApp({ store: new TournamentStore(), adminToken: ADMIN, now: () => clock });
let base = '';

async function call(method: string, path: string, body?: unknown, admin = false) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(admin ? { authorization: `Bearer ${ADMIN}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() as any };
}

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

describe('API', () => {
  it('expone la configuración del juego', async () => {
    const { status, body } = await call('GET', '/api/config');
    assert.equal(status, 200);
    assert.equal(body.units.warrior.cost, 2);
    assert.equal(body.cards['ancestral-golem'].race, 'dwarf');
    assert.equal(Object.keys(body.races).length, 5);
  });

  it('simula contra un preset y valida el ejército', async () => {
    const ok = await call('POST', '/api/simulate', { army: PRESET_ARMIES.wall.army, opponent: 'horde' });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.frames.length > 0);
    const bad = await call('POST', '/api/simulate', { army: { units: [] }, opponent: 'horde' });
    assert.equal(bad.status, 400);
  });

  it('solo el admin crea torneos', async () => {
    const t = { id: 'copa-1', name: 'Copa 1', closesAt: '2026-01-02T00:00:00Z', sponsorPool: 10_000_000 };
    assert.equal((await call('POST', '/api/tournaments', t)).status, 401);
    assert.equal((await call('POST', '/api/tournaments', t, true)).status, 200);
  });

  it('oculta los ejércitos hasta el cierre y luego publica resultados verificables', async () => {
    for (const [playerId, preset] of [['ana', 'wall'], ['beto', 'horde'], ['cris', 'arcane']] as const) {
      const r = await call('POST', '/api/tournaments/copa-1/entries', { playerId, army: PRESET_ARMIES[preset].army });
      assert.equal(r.status, 200);
      assert.equal(r.body.commitment, commitmentFor('copa-1', playerId, PRESET_ARMIES[preset].army, r.body.salt));
    }
    const open = await call('GET', '/api/tournaments/copa-1');
    assert.equal(open.body.entries, undefined);
    assert.equal(open.body.commitments.length, 3);
    assert.equal((await call('GET', '/api/tournaments/copa-1/replay?left=ana&right=beto')).status, 403);

    const closed = await call('POST', '/api/tournaments/copa-1/close', {}, true);
    assert.equal(closed.status, 200);
    assert.equal(closed.body.status, 'closed');
    const { plan, pool } = closed.body.result;
    assert.equal(pool, 10_000_000);
    assert.equal(plan.fee + plan.payouts.reduce((s: number, p: any) => s + p.amount, 0), pool);
    assert.equal((await call('GET', '/api/tournaments/copa-1/replay?left=ana&right=beto')).status, 200);
    assert.equal((await call('POST', '/api/tournaments/copa-1/entries', { playerId: 'dani', army: PRESET_ARMIES.horde.army })).status, 409);
  });

  it('rechaza inscripciones tras la hora de cierre', async () => {
    await call('POST', '/api/tournaments', { id: 'copa-2', closesAt: '2026-01-01T13:00:00Z' }, true);
    clock = new Date('2026-01-01T13:00:01Z');
    const r = await call('POST', '/api/tournaments/copa-2/entries', { playerId: 'ana', army: PRESET_ARMIES.horde.army });
    assert.equal(r.status, 409);
  });

  it('los torneos de pago fallan cerrado sin verificador de pagos', async () => {
    await call('POST', '/api/tournaments', { id: 'copa-pago', closesAt: '2026-01-05T00:00:00Z', entryFee: 1_000_000, feeBps: 1000 }, true);
    const r = await call('POST', '/api/tournaments/copa-pago/entries', { playerId: 'ana', army: PRESET_ARMIES.horde.army });
    assert.equal(r.status, 503);
  });

  it('los torneos con cartas propias fallan cerrado sin verificador de inventario', async () => {
    await call('POST', '/api/tournaments', { id: 'copa-coleccion', closesAt: '2026-01-05T00:00:00Z', cardPool: 'owned' }, true);
    const withCards = await call('POST', '/api/tournaments/copa-coleccion/entries', { playerId: 'ana', army: PRESET_ARMIES.horde.army });
    assert.equal(withCards.status, 503);
    const noCards = { ...PRESET_ARMIES.horde.army, cards: [] };
    assert.equal((await call('POST', '/api/tournaments/copa-coleccion/entries', { playerId: 'ana', army: noCards })).status, 200);
  });

  it('rechaza cartas de otra raza', async () => {
    const army = { ...PRESET_ARMIES.horde.army, cards: [{ card: 'sylvaran-storm', turn: 1 }] };
    assert.equal((await call('POST', '/api/simulate', { army, opponent: 'wall' })).status, 400);
  });

  it('guarda la wallet de premios en privado y la exporta solo al organizador', async () => {
    await call('POST', '/api/tournaments', { id: 'copa-premios', closesAt: '2026-01-10T00:00:00Z', sponsorPool: 20_000_000 }, true);
    const wallet = '0x' + 'ab'.repeat(20);
    assert.equal((await call('POST', '/api/tournaments/copa-premios/entries', { playerId: 'ana', army: PRESET_ARMIES.wall.army, wallet: 'no-es-wallet' })).status, 400);
    assert.equal((await call('POST', '/api/tournaments/copa-premios/entries', { playerId: 'ana', army: PRESET_ARMIES.wall.army, wallet })).status, 200);
    assert.equal((await call('POST', '/api/tournaments/copa-premios/entries', { playerId: 'beto', army: PRESET_ARMIES.volley.army })).status, 200);
    await call('POST', '/api/tournaments/copa-premios/close', {}, true);
    const view = await call('GET', '/api/tournaments/copa-premios');
    assert.ok(!JSON.stringify(view.body).includes(wallet), 'la wallet no debe ser pública');

    const csvUrl = `${base}/api/tournaments/copa-premios/payouts.csv`;
    assert.equal((await fetch(csvUrl)).status, 401);
    const csv = await (await fetch(csvUrl, { headers: { authorization: `Bearer ${ADMIN}` } })).text();
    const lines = csv.trim().split('\n');
    assert.equal(lines[0], 'puesto,jugador,wallet,usdc');
    const total = lines.slice(1).reduce((s, l) => s + Number(l.split(',')[3]), 0);
    assert.equal(total, 20);
    assert.ok(lines.some((l) => l.includes(wallet)));
    assert.ok(lines.some((l) => l.includes('SIN WALLET')));
  });

  it('rechaza comisiones por encima del máximo', async () => {
    const r = await call('POST', '/api/tournaments', { id: 'abusivo', closesAt: '2026-02-01T00:00:00Z', feeBps: 5000 }, true);
    assert.equal(r.status, 400);
  });
});
