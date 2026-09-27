import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cutoutBackground, transparentRatio } from './cutout.ts';

// Imagen sintética: fondo gris con degradado vertical y una figura oscura en el centro.
function sample(w = 80, h = 80) {
  const data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    const inside = x >= 30 && x < 50 && y >= 15 && y < 70;
    const v = inside ? 40 : 200 - Math.round(y * 0.6);
    data[i] = v; data[i + 1] = v; data[i + 2] = inside ? 90 : v;
  }
  return { data, width: w, height: h, channels: 3 };
}

describe('cutoutBackground', () => {
  it('quita el fondo degradado, conserva la figura y recorta al contorno', () => {
    const out = cutoutBackground(sample());
    assert.equal(out.channels, 4);
    assert.equal(out.width, 20 + 8);
    assert.equal(out.height, 55 + 8);
    const center = ((out.height >> 1) * out.width + (out.width >> 1)) * 4;
    assert.equal(out.data[center + 3], 255);
    assert.equal(out.data[3], 0);
    assert.ok(transparentRatio(out) > 0.2);
  });

  it('vacía la zona indicada (marca de agua)', () => {
    const img = sample();
    // Una «marca» oscura en la esquina inferior derecha.
    for (let y = 74; y < 78; y++) for (let x = 60; x < 76; x++) img.data.fill(0, (y * 80 + x) * 3, (y * 80 + x) * 3 + 3);
    const out = cutoutBackground(img, { clear: { x: 0.7, y: 0.9, w: 0.3, h: 0.1 } });
    assert.equal(out.width, 28);
  });
});
