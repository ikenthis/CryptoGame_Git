import assert from 'node:assert/strict';
import { createServer, type IncomingMessage } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { CARD_IDS, RACE_IDS } from '@gentium/engine';
import { generateAll, openaiProvider, replicateProvider } from './generate.ts';
import { ART_JOBS } from './prompts.ts';

const PNG = Buffer.from('fake-image-bytes');
const requests: Array<{ url: string; auth?: string; body: any }> = [];
let base = '';

const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
};

// Imita las APIs de OpenAI y Replicate para probar el script sin gastar créditos.
const server = createServer(async (req, res) => {
  const body = await readBody(req);
  requests.push({ url: req.url!, auth: req.headers.authorization, body });
  res.setHeader('content-type', 'application/json');
  if (req.url === '/v1/images/generations') {
    if (body.prompt.includes('FALLA')) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: { message: 'rechazado' } }));
    }
    return res.end(JSON.stringify({ data: [{ b64_json: PNG.toString('base64') }] }));
  }
  if (req.url?.startsWith('/v1/models/')) {
    return res.end(JSON.stringify({ status: 'processing', urls: { get: `${base}/v1/predictions/1` } }));
  }
  if (req.url === '/v1/predictions/1') return res.end(JSON.stringify({ status: 'succeeded', output: [`${base}/files/out.webp`] }));
  if (req.url === '/files/out.webp') {
    res.setHeader('content-type', 'image/webp');
    return res.end(PNG);
  }
  res.statusCode = 404;
  res.end('{}');
});

before(async () => {
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

describe('prompts de arte', () => {
  it('cubren cada carta, cada raza y la imagen principal, sin texto en la imagen', () => {
    const ids = new Set(ART_JOBS.map((j) => j.id));
    for (const c of CARD_IDS) assert.ok(ids.has(`cards/${c}`), c);
    for (const r of RACE_IDS) assert.ok(ids.has(`races/${r}`), r);
    assert.ok(ids.has('scenes/keyart'));
    for (const j of ART_JOBS) assert.match(j.prompt, /no text/i);
  });
});

describe('generateAll', () => {
  it('genera con OpenAI, escribe el manifest y no repite lo ya generado', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'art-'));
    try {
      const jobs = ART_JOBS.filter((j) => j.id === 'cards/meteor' || j.id === 'races/elf');
      const provider = openaiProvider('sk-test', `${base}/v1`, 'gpt-image-1');
      const first = await generateAll({ provider, outDir: dir, jobs, log: () => {} });
      assert.deepEqual(first.generated.sort(), ['cards/meteor', 'races/elf']);
      assert.deepEqual(await readFile(join(dir, 'cards/meteor.webp')), PNG);
      const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
      assert.deepEqual(manifest, { 'cards/meteor': 'art/cards/meteor.webp', 'races/elf': 'art/races/elf.webp' });

      const call = requests.find((r) => r.url === '/v1/images/generations')!;
      assert.equal(call.auth, 'Bearer sk-test');
      assert.equal(call.body.model, 'gpt-image-1');
      assert.equal(call.body.output_format, 'webp');

      const second = await generateAll({ provider, outDir: dir, jobs, log: () => {} });
      assert.equal(second.generated.length, 0);
      assert.equal(second.skipped.length, 2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('informa de los fallos sin detener el resto', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'art-'));
    try {
      const jobs = [{ id: 'x/ok', size: '1024x1024' as const, prompt: 'ok' }, { id: 'x/bad', size: '1024x1024' as const, prompt: 'FALLA' }];
      const report = await generateAll({ provider: openaiProvider('k', `${base}/v1`), outDir: dir, jobs, log: () => {}, concurrency: 1, retryBaseMs: 1 });
      assert.deepEqual(report.generated, ['x/ok']);
      assert.equal(report.failed[0].id, 'x/bad');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('genera con Replicate esperando a que termine la predicción', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'art-'));
    try {
      const jobs = ART_JOBS.filter((j) => j.id === 'scenes/keyart');
      const report = await generateAll({ provider: replicateProvider('r8_test', `${base}/v1`), outDir: dir, jobs, log: () => {} });
      assert.deepEqual(report.generated, ['scenes/keyart']);
      const call = requests.find((r) => r.url?.startsWith('/v1/models/'))!;
      assert.equal(call.body.input.aspect_ratio, '3:2');
      assert.deepEqual(await readFile(join(dir, 'scenes/keyart.webp')), PNG);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
