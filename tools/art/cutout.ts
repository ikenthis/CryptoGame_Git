// Recorte de fondo para sprites generados sin transparencia. Los modelos
// gratuitos pintan un fondo liso con degradado suave: se inunda desde los bordes
// avanzando solo entre píxeles parecidos a su vecino (sigue el degradado sin
// cruzar el contorno de la figura), se suaviza el borde y se recorta al contorno.

export interface RawImage {
  data: Uint8Array | Buffer;
  width: number;
  height: number;
  /** 3 (RGB) o 4 (RGBA). */
  channels: number;
}

export interface CutoutOptions {
  /** Diferencia máxima entre vecinos para seguir el fondo (suma de |ΔR|+|ΔG|+|ΔB|). */
  step?: number;
  /** Diferencia máxima con el color medio del borde. */
  range?: number;
  /** Zona a vaciar siempre (p. ej. una marca de agua), en fracciones del tamaño. */
  clear?: { x: number; y: number; w: number; h: number };
}

/** Devuelve RGBA con el fondo transparente y recortado a la figura (con 4 px de margen). */
export function cutoutBackground(img: RawImage, opts: CutoutOptions = {}): RawImage {
  const { width: w, height: h, channels: ch } = img;
  const step = opts.step ?? 16;
  const range = opts.range ?? 240;
  const src = img.data;
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = src[i * ch];
    rgba[i * 4 + 1] = src[i * ch + 1];
    rgba[i * 4 + 2] = src[i * ch + 2];
    rgba[i * 4 + 3] = ch === 4 ? src[i * ch + 3] : 255;
  }

  // Color medio del borde: referencia del fondo.
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  const bg = [0, 1, 2].map((k) => border.reduce((s, i) => s + rgba[i * 4 + k], 0) / border.length);
  // Copia desenfocada: el ruido JPEG y el grano no deben frenar el relleno.
  const guide = boxBlur(rgba, w, h, 2);
  const diff = (i: number, j: number) =>
    Math.abs(guide[i * 3] - guide[j * 3]) + Math.abs(guide[i * 3 + 1] - guide[j * 3 + 1]) + Math.abs(guide[i * 3 + 2] - guide[j * 3 + 2]);
  const fromBg = (i: number) =>
    Math.abs(guide[i * 3] - bg[0]) + Math.abs(guide[i * 3 + 1] - bg[1]) + Math.abs(guide[i * 3 + 2] - bg[2]);

  const isBg = new Uint8Array(w * h);
  const stack: number[] = [];
  for (const i of border) {
    if (!isBg[i] && fromBg(i) < range) {
      isBg[i] = 1;
      stack.push(i);
    }
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const next = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * (h - 1) ? i + w : -1];
    for (const n of next) {
      if (n < 0 || isBg[n]) continue;
      if (diff(i, n) < step && fromBg(n) < range) {
        isBg[n] = 1;
        stack.push(n);
      }
    }
  }

  // El desenfoque deja un anillo de fondo junto a la figura: se come con los píxeles reales.
  const raw = (i: number, j: number) =>
    Math.abs(rgba[i * 4] - rgba[j * 4]) + Math.abs(rgba[i * 4 + 1] - rgba[j * 4 + 1]) + Math.abs(rgba[i * 4 + 2] - rgba[j * 4 + 2]);
  for (let pass = 0; pass < 4; pass++) {
    const grow: number[] = [];
    for (let i = 0; i < w * h; i++) {
      if (isBg[i]) continue;
      const x = i % w;
      for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * (h - 1) ? i + w : -1]) {
        if (n >= 0 && isBg[n] && raw(i, n) < step * 1.5) {
          grow.push(i);
          break;
        }
      }
    }
    if (!grow.length) break;
    for (const i of grow) isBg[i] = 1;
  }

  if (opts.clear) {
    const { x, y, w: cw, h: chh } = opts.clear;
    for (let yy = Math.floor(y * h); yy < Math.min(h, Math.ceil((y + chh) * h)); yy++) {
      for (let xx = Math.floor(x * w); xx < Math.min(w, Math.ceil((x + cw) * w)); xx++) isBg[yy * w + xx] = 1;
    }
  }

  for (let i = 0; i < w * h; i++) {
    if (isBg[i]) rgba[i * 4 + 3] = 0;
    else {
      // Borde suave: los píxeles de la figura que tocan el fondo quedan semitransparentes.
      const x = i % w;
      const touches = (x > 0 && isBg[i - 1]) || (x < w - 1 && isBg[i + 1]) || (i >= w && isBg[i - w]) || (i < w * (h - 1) && isBg[i + w]);
      if (touches) rgba[i * 4 + 3] = Math.min(rgba[i * 4 + 3], 150);
    }
  }

  // Quita islas pequeñas que no son fondo pero tampoco figura (motas, restos de la marca).
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rgba[(y * w + x) * 4 + 3] > 40) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { data: rgba, width: w, height: h, channels: 4 };
  const pad = 4;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const cw = x1 - x0 + 1, chh = y1 - y0 + 1;
  const out = new Uint8Array(cw * chh * 4);
  for (let y = 0; y < chh; y++) out.set(rgba.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x1 + 1) * 4), y * cw * 4);
  return { data: out, width: cw, height: chh, channels: 4 };
}

/** Proporción de píxeles de fondo eliminados (para detectar recortes fallidos). */
export function transparentRatio(img: RawImage): number {
  let n = 0;
  for (let i = 0; i < img.width * img.height; i++) if (img.data[i * 4 + 3] === 0) n++;
  return n / (img.width * img.height);
}

/** Desenfoque de caja separable (RGB) sobre una imagen RGBA. */
function boxBlur(rgba: Uint8Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h * 3);
  const out = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let k = 0; k < 3; k++) {
        let sum = 0, n = 0;
        for (let d = -r; d <= r; d++) {
          const xx = x + d;
          if (xx < 0 || xx >= w) continue;
          sum += rgba[(y * w + xx) * 4 + k];
          n++;
        }
        tmp[(y * w + x) * 3 + k] = sum / n;
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let k = 0; k < 3; k++) {
        let sum = 0, n = 0;
        for (let d = -r; d <= r; d++) {
          const yy = y + d;
          if (yy < 0 || yy >= h) continue;
          sum += tmp[(yy * w + x) * 3 + k];
          n++;
        }
        out[(y * w + x) * 3 + k] = sum / n;
      }
    }
  }
  return out;
}
