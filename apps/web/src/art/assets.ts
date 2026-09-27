// Ilustraciones generadas (tools/art/generate.ts). El manifest lista las que
// existen; lo que no esté se dibuja con el arte vectorial de siempre.

declare global {
  interface Window {
    /** Ilustraciones incrustadas por la demo de un solo archivo (build-demo.mjs). */
    __ART__?: Record<string, string>;
  }
}

let manifest: Record<string, string> = {};

const unitSprites = new Map<string, HTMLCanvasElement>();

export async function loadArt(): Promise<void> {
  if (window.__ART__) manifest = window.__ART__;
  else {
    try {
      const res = await fetch('art/manifest.json', { cache: 'no-cache' });
      if (res.ok) manifest = await res.json();
    } catch {
      manifest = {};
    }
  }
  // Los sprites del tablero se preparan una vez (recorte del fondo) antes de pintar.
  await Promise.all(Object.entries(manifest).filter(([id]) => id.startsWith('units/')).map(async ([id, url]) => {
    try {
      unitSprites.set(id, cutout(await loadImage(url)));
    } catch { /* si falla, se usa el sprite vectorial */ }
  }));
}

/** Sprite ilustrado de una unidad («units/human-knight», «units/commander-aldric») ya recortado. */
export function unitArt(id: string): HTMLCanvasElement | null {
  return unitSprites.get(id) ?? null;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Quita el fondo liso de un sprite (los generadores sin transparencia lo pintan
 * sobre blanco): relleno por inundación desde los bordes con el color de las
 * esquinas, bordes suavizados y recorte al contorno de la figura.
 */
export function cutout(img: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const w = img.width, h = img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d', { willReadFrequently: true })!;
  c.drawImage(img, 0, 0);
  const data = c.getImageData(0, 0, w, h);
  const px = data.data;
  const hasAlpha = [0, w - 1, (h - 1) * w, h * w - 1].some((i) => px[i * 4 + 3] < 250);
  if (!hasAlpha) {
    const bg = [0, 1, 2].map((k) => (px[k] + px[(w - 1) * 4 + k] + px[(h - 1) * w * 4 + k] + px[(h * w - 1) * 4 + k]) / 4);
    const dist = (i: number) => Math.abs(px[i * 4] - bg[0]) + Math.abs(px[i * 4 + 1] - bg[1]) + Math.abs(px[i * 4 + 2] - bg[2]);
    const HARD = 60, SOFT = 140;
    const seen = new Uint8Array(w * h);
    const stack: number[] = [];
    for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
    while (stack.length) {
      const i = stack.pop()!;
      if (seen[i]) continue;
      seen[i] = 1;
      const d = dist(i);
      if (d >= SOFT) continue;
      // Cerca del fondo: transparente; en la franja intermedia, semitransparente (borde suave).
      px[i * 4 + 3] = d < HARD ? 0 : Math.round(255 * (d - HARD) / (SOFT - HARD));
      if (d >= HARD) continue;
      const x = i % w;
      if (x > 0) stack.push(i - 1);
      if (x < w - 1) stack.push(i + 1);
      if (i >= w) stack.push(i - w);
      if (i < w * (h - 1)) stack.push(i + w);
    }
    c.putImageData(data, 0, 0);
  }
  // Recorte al contorno visible.
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (px[(y * w + x) * 4 + 3] > 24) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return canvas;
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d')!.drawImage(canvas, -x0, -y0);
  return out;
}

/** URL relativa de una ilustración (p. ej. "cards/meteor") o null si no existe. */
export function artUrl(id: string): string | null {
  return manifest[id] ?? null;
}
