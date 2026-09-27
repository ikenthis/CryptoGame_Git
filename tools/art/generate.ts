// Genera las ilustraciones del juego con un modelo de imagen y actualiza
// apps/web/public/art/manifest.json. El juego usa cada ilustración si existe y,
// si no, su arte vectorial.
//
// Uso:
//   node tools/art/generate.ts --provider pollinations   (gratis y sin clave; Flux vía Pollinations)
//   OPENAI_API_KEY=...        node tools/art/generate.ts                  (gpt-image-1)
//   REPLICATE_API_TOKEN=...   node tools/art/generate.ts --provider replicate   (Flux)
// Opciones: --only units,cards/meteor   --force   --dry-run   --keep-size (no reducir)
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cutoutBackground } from './cutout.ts';
import { ART_JOBS, type ArtJob } from './prompts.ts';

export interface Provider {
  name: string;
  generate(job: ArtJob): Promise<Buffer>;
}

export function openaiProvider(apiKey: string, baseUrl = 'https://api.openai.com/v1', model = 'gpt-image-1'): Provider {
  return {
    name: `openai:${model}`,
    async generate(job) {
      const res = await fetch(`${baseUrl}/images/generations`, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model, prompt: job.prompt, size: job.size, quality: 'high', output_format: 'webp', n: 1,
          ...(job.transparent ? { background: 'transparent' } : {}),
        }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const body = await res.json() as { data?: Array<{ b64_json?: string; url?: string }> };
      const item = body.data?.[0];
      if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
      if (item?.url) return download(item.url);
      throw new Error('OpenAI no devolvió ninguna imagen.');
    },
  };
}

export function replicateProvider(apiToken: string, baseUrl = 'https://api.replicate.com/v1', model = 'black-forest-labs/flux-1.1-pro'): Provider {
  const aspect = { '1536x1024': '3:2', '1024x1024': '1:1', '1024x1536': '2:3' } as const;
  return {
    name: `replicate:${model}`,
    async generate(job) {
      const headers = { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json', prefer: 'wait' };
      const res = await fetch(`${baseUrl}/models/${model}/predictions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ input: { prompt: job.prompt, aspect_ratio: aspect[job.size], output_format: 'webp', output_quality: 90 } }),
      });
      if (!res.ok) throw new Error(`Replicate ${res.status}: ${(await res.text()).slice(0, 300)}`);
      let prediction = await res.json() as { status: string; output?: string | string[]; error?: string; urls?: { get?: string } };
      for (let i = 0; i < 60 && !['succeeded', 'failed', 'canceled'].includes(prediction.status); i++) {
        await sleep(2000);
        if (!prediction.urls?.get) break;
        prediction = await (await fetch(prediction.urls.get, { headers })).json() as typeof prediction;
      }
      if (prediction.status !== 'succeeded') throw new Error(`Replicate: ${prediction.error ?? prediction.status}`);
      const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      if (!url) throw new Error('Replicate no devolvió ninguna imagen.');
      return download(url);
    },
  };
}

/**
 * Pollinations: gratuito y sin clave. Sin fondo transparente: los sprites se
 * piden sobre blanco y el juego recorta el fondo al cargarlos. El plan gratuito
 * añade una marca en la esquina inferior derecha, que aquí se elimina.
 */
export function pollinationsProvider(baseUrl = 'https://image.pollinations.ai', model?: string): Provider {
  return {
    name: `pollinations${model ? `:${model}` : ''}`,
    async generate(job) {
      const [width, height] = job.size.split('x');
      const seed = [...job.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % 1_000_000;
      const query = new URLSearchParams({ width, height, seed: String(seed), nologo: 'true', ...(model ? { model } : {}) });
      const image = await download(`${baseUrl}/prompt/${encodeURIComponent(job.prompt)}?${query}`);
      return removeWatermark(image, job);
    },
  };
}

/** Escenas: recorta la franja inferior con la marca. Los sprites la pierden al recortar el fondo. */
export async function removeWatermark(image: Buffer, job: ArtJob): Promise<Buffer> {
  let sharp: typeof import('sharp');
  try {
    sharp = (await import('sharp')).default;
  } catch {
    return image;
  }
  if (job.transparent) return image;
  const img = sharp(image);
  const meta = await img.metadata();
  if (!meta.width || !meta.height) return image;
  const w = meta.width, h = meta.height;
  return img.extract({ left: 0, top: 0, width: w, height: Math.round(h * 0.91) }).png().toBuffer();
}

export interface GenerateOptions {
  provider: Provider;
  outDir: string;
  jobs?: ArtJob[];
  force?: boolean;
  concurrency?: number;
  /** Posproceso de cada imagen (p. ej. reducir tamaño y pasar a WebP). */
  optimize?: (image: Buffer, job: ArtJob) => Promise<Buffer>;
  /** Espera base entre reintentos (se duplica en cada intento). */
  retryBaseMs?: number;
  log?: (line: string) => void;
}

export interface GenerateReport {
  generated: string[];
  skipped: string[];
  failed: Array<{ id: string; error: string }>;
}

/** Genera las ilustraciones que falten (o todas con `force`) y mantiene el manifest al día. */
export async function generateAll(options: GenerateOptions): Promise<GenerateReport> {
  const { provider, outDir, jobs = ART_JOBS, force = false, concurrency = 3, retryBaseMs = 1000, log = console.log, optimize } = options;
  const manifestPath = join(outDir, 'manifest.json');
  const manifest: Record<string, string> = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {};
  const report: GenerateReport = { generated: [], skipped: [], failed: [] };
  const saveManifest = () => writeFile(manifestPath, `${JSON.stringify(sortKeys(manifest), null, 2)}\n`);

  const queue = [...jobs];
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const file = `${job.id}.webp`;
      const path = join(outDir, file);
      if (!force && existsSync(path)) {
        manifest[job.id] = `art/${file}`;
        report.skipped.push(job.id);
        continue;
      }
      try {
        const raw = await retry(() => provider.generate(job), 3, retryBaseMs);
        const image = optimize ? await optimize(raw, job) : raw;
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, image);
        manifest[job.id] = `art/${file}`;
        await saveManifest();
        report.generated.push(job.id);
        log(`✔ ${job.id} (${Math.round(image.length / 1024)} KB)`);
      } catch (err) {
        report.failed.push({ id: job.id, error: (err as Error).message });
        log(`✘ ${job.id}: ${(err as Error).message}`);
      }
    }
  };
  await mkdir(outDir, { recursive: true });
  await Promise.all(Array.from({ length: concurrency }, worker));
  await saveManifest();
  return report;
}

async function retry<T>(fn: () => Promise<T>, attempts: number, baseMs: number): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts) throw err;
      await sleep(baseMs * 2 ** i);
    }
  }
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Descarga ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Tamaño final en el juego: los sprites se ven a unos 90 px, así que 256 px sobran. */
export const MAX_SIDE = { sprite: 256, portrait: 320, wide: 960 } as const;

/**
 * Reduce cada imagen y la guarda como WebP ligero (necesita el paquete sharp).
 * Los sprites sin transparencia se recortan del fondo aquí mismo; con
 * `clearWatermark` también se vacía la esquina de la marca de Pollinations.
 */
export async function sharpOptimizer(opts: { clearWatermark?: boolean } = {}): Promise<(image: Buffer, job: ArtJob) => Promise<Buffer>> {
  const { default: sharp } = await import('sharp');
  return async (image, job) => {
    let input = sharp(image);
    if (job.transparent) {
      const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const cornerAlpha = data[3];
      const ai = cornerAlpha < 250 ? null : await aiCutout(image);
      if (ai) {
        input = sharp(ai).trim();
      } else {
        const cut = cornerAlpha < 250
          ? { data, width: info.width, height: info.height, channels: 4 } // ya trae transparencia
          : cutoutBackground({ data, width: info.width, height: info.height, channels: 4 },
            opts.clearWatermark ? { clear: { x: 0.62, y: 0.9, w: 0.38, h: 0.1 } } : {});
        input = sharp(Buffer.from(cut.data), { raw: { width: cut.width, height: cut.height, channels: 4 } }).trim();
      }
    }
    const side = job.transparent ? MAX_SIDE.sprite : job.size === '1024x1024' ? MAX_SIDE.portrait : MAX_SIDE.wide;
    return input.resize(side, side, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 90, effort: 6 }).toBuffer();
  };
}

/**
 * Quita el fondo con un modelo de segmentación que corre en local
 * (@imgly/background-removal-node). Si no está instalado, devuelve null y se usa
 * el recorte por relleno (cutout.ts), menos preciso con fondos degradados.
 */
async function aiCutout(image: Buffer): Promise<Buffer | null> {
  let removeBackground: (typeof import('@imgly/background-removal-node'))['removeBackground'];
  try {
    ({ removeBackground } = await import('@imgly/background-removal-node'));
  } catch {
    return null;
  }
  const { default: sharp } = await import('sharp');
  const png = await sharp(image).png().toBuffer();
  const blob = await removeBackground(new Blob([new Uint8Array(png)], { type: 'image/png' }), { model: 'medium', output: { format: 'image/png' } });
  return Buffer.from(await blob.arrayBuffer());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sortKeys(obj: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

// ---------- CLI ----------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.includes(`--${name}`);
  const value = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const only = value('only')?.split(',').map((s) => s.trim()).filter(Boolean);
  const jobs = only ? ART_JOBS.filter((j) => only.some((prefix) => j.id.startsWith(prefix))) : ART_JOBS;
  const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/web/public/art');

  if (flag('dry-run')) {
    for (const j of jobs) console.log(`\n[${j.id}] ${j.size}\n${j.prompt}`);
    console.log(`\n${jobs.length} ilustraciones. Coste orientativo: ~${(jobs.length * 0.2).toFixed(2)} USD con gpt-image-1 en calidad alta.`);
    return;
  }

  const which = value('provider') ?? (process.env.OPENAI_API_KEY ? 'openai' : process.env.REPLICATE_API_TOKEN ? 'replicate' : 'pollinations');
  let provider: Provider;
  if (which === 'openai') {
    if (!process.env.OPENAI_API_KEY) throw new Error('Falta OPENAI_API_KEY.');
    provider = openaiProvider(process.env.OPENAI_API_KEY, process.env.OPENAI_BASE_URL, process.env.OPENAI_IMAGE_MODEL);
  } else if (which === 'replicate') {
    if (!process.env.REPLICATE_API_TOKEN) throw new Error('Falta REPLICATE_API_TOKEN (o usa OPENAI_API_KEY).');
    provider = replicateProvider(process.env.REPLICATE_API_TOKEN, process.env.REPLICATE_BASE_URL, process.env.REPLICATE_MODEL);
  } else if (which === 'pollinations') {
    provider = pollinationsProvider(process.env.POLLINATIONS_BASE_URL, process.env.POLLINATIONS_MODEL);
    // Servicio gratuito: de una en una para no saturarlo.
    console.log('Usando Pollinations (gratis). Para más calidad: OPENAI_API_KEY o REPLICATE_API_TOKEN.');
  } else {
    throw new Error(`Proveedor desconocido: ${which}`);
  }

  console.log(`Generando ${jobs.length} ilustraciones con ${provider.name} en ${outDir}`);
  const report = await generateAll({ provider, outDir, jobs, force: flag('force'), concurrency: which === 'pollinations' ? 1 : 3,
    optimize: flag('keep-size') ? undefined : await sharpOptimizer({ clearWatermark: which === 'pollinations' }),
  });
  console.log(`\nListo: ${report.generated.length} generadas, ${report.skipped.length} ya existían, ${report.failed.length} fallidas.`);
  if (report.failed.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  });
}
