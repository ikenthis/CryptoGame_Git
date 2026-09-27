import { BOSSES, COMMANDERS, type ArmorId, type Race, type Special, type UnitType } from '@gentium/engine';
import { ARMOR_ART, RACE_ART, type ArmorArt, type RaceArt } from './theme.ts';

// Sprites procedurales: cada unidad se dibuja con vectores según su raza y su
// armadura, y se cachea en un canvas. Caja lógica de 100×100 con los pies en
// (50, 90), mirando a la derecha. Para arte final basta con sustituir getSprite()
// por hojas de sprites manteniendo esa misma caja.

export const SPRITE_BOX = 100;
const RES = 2.5;
const OUTLINE = '#0c0a10';
const cache = new Map<string, HTMLCanvasElement>();

interface Painter {
  c: CanvasRenderingContext2D;
  race: Race;
  r: RaceArt;
  a: ArmorArt;
}

/** Sprite de cualquier unidad, incluidos comandantes (con corona) y jefes. */
export function spriteFor(u: { type: UnitType; special?: Special }, race: Race, armor: ArmorId, facing: 1 | -1, white = false): HTMLCanvasElement {
  if (u.special?.kind === 'commander') return getSprite(u.type, race, armor, facing, white, u.special.id);
  if (u.special?.kind === 'boss') return getSprite(u.type, race, armor, facing, white, u.special.id);
  return getSprite(u.type, race, armor, facing, white);
}

export function getSprite(type: UnitType, race: Race, armor: ArmorId, facing: 1 | -1, white = false, specialId = ''): HTMLCanvasElement {
  const key = `${type}|${specialId}|${race}|${armor}|${facing}|${white}`;
  let canvas = cache.get(key);
  if (canvas) return canvas;
  canvas = document.createElement('canvas');
  canvas.width = canvas.height = SPRITE_BOX * RES;
  const c = canvas.getContext('2d')!;
  c.scale(RES, RES);
  if (facing === -1) {
    c.translate(SPRITE_BOX, 0);
    c.scale(-1, 1);
  }
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const p: Painter = { c, race, r: RACE_ART[race], a: ARMOR_ART[armor] };
  if (type === 'commander' && specialId in COMMANDERS) drawCommander(p, specialId as keyof typeof COMMANDERS);
  else if (type === 'boss' && specialId in BOSSES) (BOSSES[specialId as keyof typeof BOSSES].look === 'dragon' ? drawDragon : drawColossus)(p);
  else DRAW[type](p);
  if (white) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, canvas.width, canvas.height);
  }
  cache.set(key, canvas);
  return canvas;
}

// ---------- Primitivas ----------

function shape(p: Painter, fill: string | CanvasGradient, path: (c: CanvasRenderingContext2D) => void, stroke = true): void {
  const { c } = p;
  c.beginPath();
  path(c);
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = OUTLINE;
    c.lineWidth = 1.4;
    c.stroke();
  }
}

function metal(p: Painter, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const g = p.c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, p.a.light);
  g.addColorStop(0.45, p.a.base);
  g.addColorStop(1, p.a.dark);
  return g;
}

function cloth(p: Painter, y0: number, y1: number): CanvasGradient {
  const g = p.c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, p.r.cloth);
  g.addColorStop(1, p.r.clothDark);
  return g;
}

function glowLine(p: Painter, color: string, blur: number, path: (c: CanvasRenderingContext2D) => void, width = 1.3): void {
  const { c } = p;
  c.save();
  c.shadowColor = color;
  c.shadowBlur = blur;
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  path(c);
  c.stroke();
  c.restore();
}

function orb(p: Painter, x: number, y: number, r: number, color: string): void {
  const { c } = p;
  c.save();
  c.shadowColor = color;
  c.shadowBlur = 14;
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, color);
  g.addColorStop(1, 'rgba(0,0,0,0.2)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function gem(p: Painter, x: number, y: number, r: number): void {
  if (!p.a.gems) return;
  const color = p.a.glow === '#ff6a1a' ? '#ff5a1a' : '#e0245e';
  const { c } = p;
  c.save();
  c.shadowColor = color;
  c.shadowBlur = 6;
  shape(p, color, (c) => {
    c.moveTo(x, y - r);
    c.lineTo(x + r, y);
    c.lineTo(x, y + r);
    c.lineTo(x - r, y);
    c.closePath();
  }, false);
  c.restore();
}

/** Emblema de la raza, usado en tabardos, escudos y estandartes. */
export function drawEmblem(c: CanvasRenderingContext2D, race: Race, x: number, y: number, s: number, color: string): void {
  c.save();
  c.translate(x, y);
  c.scale(s / 10, s / 10);
  c.fillStyle = color;
  c.strokeStyle = color;
  c.lineWidth = 1.6;
  c.beginPath();
  switch (race) {
    case 'human':
      c.arc(0, 0, 3.5, 0, Math.PI * 2);
      c.fill();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        c.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
        c.lineTo(Math.cos(a) * 8.5, Math.sin(a) * 8.5);
      }
      c.stroke();
      break;
    case 'elf':
      c.moveTo(0, -9);
      c.quadraticCurveTo(8, -2, 0, 9);
      c.quadraticCurveTo(-8, -2, 0, -9);
      c.fill();
      break;
    case 'orc':
      c.moveTo(-7, -7); c.lineTo(7, 7); c.moveTo(7, -7); c.lineTo(-7, 7);
      c.lineWidth = 2.6;
      c.stroke();
      c.beginPath();
      c.moveTo(-9, -8); c.lineTo(-4, -9); c.lineTo(-6, -3); c.closePath();
      c.moveTo(9, -8); c.lineTo(4, -9); c.lineTo(6, -3); c.closePath();
      c.fill();
      break;
    case 'undead':
      c.arc(0, -1, 6.5, 0, Math.PI * 2);
      c.rect(-3.5, 3, 7, 5);
      c.fill();
      c.globalCompositeOperation = 'destination-out';
      c.beginPath();
      c.arc(-2.5, -1.5, 1.8, 0, Math.PI * 2);
      c.arc(2.5, -1.5, 1.8, 0, Math.PI * 2);
      c.fill();
      break;
    case 'dwarf':
      c.rect(-7, -8, 14, 6);
      c.rect(-1.5, -2, 3, 11);
      c.fill();
      break;
  }
  c.restore();
}

// ---------- Partes del cuerpo ----------

function cape(p: Painter): void {
  if (!p.a.cape) return;
  shape(p, cloth(p, 44, 90), (c) => {
    c.moveTo(60, 45);
    c.bezierCurveTo(46, 58, 34, 70, 24, 90);
    c.lineTo(52, 91);
    c.bezierCurveTo(54, 72, 58, 60, 63, 49);
    c.closePath();
  });
  if (p.a.glow) glowLine(p, p.a.glow, 8, (c) => { c.moveTo(25, 89); c.lineTo(51, 90); }, 1.8);
}

function legs(p: Painter): void {
  const g = metal(p, 40, 68, 60, 90);
  shape(p, g, (c) => c.rect(41, 68, 8, 17));
  shape(p, g, (c) => c.rect(51, 68, 8, 17));
  shape(p, p.a.dark, (c) => { c.roundRect(40, 83, 11, 7, 2); c.roundRect(50, 83, 12, 7, 2); });
}

function torso(p: Painter, light = false): void {
  shape(p, light ? cloth(p, 46, 70) : metal(p, 36, 46, 64, 70), (c) => {
    c.moveTo(36, 46); c.lineTo(64, 46); c.lineTo(61, 71); c.lineTo(39, 71); c.closePath();
  });
  // Tabardo con el emblema de la raza.
  shape(p, cloth(p, 50, 76), (c) => { c.moveTo(45, 50); c.lineTo(56, 50); c.lineTo(56, 76); c.lineTo(50.5, 80); c.lineTo(45, 76); c.closePath(); });
  drawEmblem(p.c, p.race, 50.5, 60, 5.5, p.r.accent);
  shape(p, p.a.trim, (c) => c.rect(38, 66, 24, 4.5));
  shape(p, p.a.gems ? '#ffd24a' : p.a.trim, (c) => c.roundRect(48, 65.5, 5, 5.5, 1));
  if (p.a.glow && !light) {
    glowLine(p, p.a.glow, 6, (c) => { c.moveTo(39, 52); c.lineTo(43, 56); c.lineTo(39, 60); c.moveTo(61, 52); c.lineTo(58, 56); c.lineTo(61, 60); });
  }
}

function pauldrons(p: Painter, size: number): void {
  for (const x of [37, 63]) {
    shape(p, metal(p, x - size, 42, x + size, 52), (c) => c.ellipse(x, 47, size, size * 0.72, 0, Math.PI, Math.PI * 2.02));
    shape(p, p.a.trim, (c) => c.rect(x - size, 46.5, size * 2, 2));
    gem(p, x, 44.5, 1.8);
  }
}

type Headgear = 'helm' | 'hood';

function head(p: Painter, gear: Headgear): void {
  const { r, a } = p;
  const helmFill = metal(p, 40, 20, 62, 44);
  switch (p.race) {
    case 'human':
      if (gear === 'hood') {
        shape(p, r.skin, (c) => c.arc(51, 34, 8.5, 0, Math.PI * 2));
        shape(p, OUTLINE, (c) => c.arc(55, 32.5, 1.1, 0, Math.PI * 2), false);
        shape(p, r.hair, (c) => { c.moveTo(45, 38); c.quadraticCurveTo(51, 47, 58, 39); c.lineTo(56, 42); c.quadraticCurveTo(51, 45, 46, 41); c.closePath(); });
      } else {
        if (a.plume) {
          for (const [dy, col] of [[0, r.cloth], [4, r.accent], [8, r.clothDark]] as const) {
            shape(p, col, (c) => { c.moveTo(50, 22 + dy * 0.3); c.bezierCurveTo(42, 10 + dy, 34, 14 + dy, 28, 28 + dy); c.bezierCurveTo(36, 22 + dy, 42, 22 + dy, 50, 26); c.closePath(); });
          }
        }
        shape(p, helmFill, (c) => { c.moveTo(40, 42); c.lineTo(40, 30); c.bezierCurveTo(40, 17, 61, 17, 61, 30); c.lineTo(61, 42); c.closePath(); });
        shape(p, OUTLINE, (c) => { c.rect(51, 30, 11, 2.4); c.rect(55, 35, 1.6, 4); c.rect(58, 35, 1.6, 4); }, false);
        shape(p, a.trim, (c) => c.rect(49.5, 20, 2.2, 22), false);
      }
      break;
    case 'elf':
      shape(p, r.hair, (c) => { c.moveTo(46, 26); c.bezierCurveTo(36, 34, 36, 48, 40, 56); c.lineTo(46, 44); c.closePath(); });
      shape(p, r.skin, (c) => c.ellipse(52, 34, 7.5, 9.5, 0, 0, Math.PI * 2));
      shape(p, r.skin, (c) => { c.moveTo(46, 33); c.lineTo(35, 23); c.lineTo(46, 29); c.closePath(); });
      shape(p, '#1d3b2c', (c) => c.ellipse(56.5, 32.5, 1.6, 1.1, 0, 0, Math.PI * 2), false);
      if (gear === 'helm') {
        shape(p, helmFill, (c) => { c.moveTo(43, 34); c.bezierCurveTo(42, 20, 56, 17, 63, 25); c.lineTo(57, 27); c.bezierCurveTo(52, 25, 47, 28, 47, 34); c.closePath(); });
        if (a.plume) shape(p, metal(p, 30, 14, 46, 30), (c) => { c.moveTo(46, 24); c.quadraticCurveTo(36, 12, 26, 16); c.quadraticCurveTo(34, 20, 44, 29); c.closePath(); });
      } else {
        glowLine(p, a.glow ?? r.accent, 6, (c) => { c.moveTo(44, 27); c.quadraticCurveTo(52, 22, 60, 26); }, 1.6);
      }
      break;
    case 'orc':
      shape(p, r.skin, (c) => { c.moveTo(42, 28); c.lineTo(61, 28); c.lineTo(63, 40); c.quadraticCurveTo(54, 47, 44, 42); c.closePath(); });
      shape(p, '#ff3b1f', (c) => c.arc(56.5, 33, 1.5, 0, Math.PI * 2), false);
      shape(p, '#f4ecd2', (c) => { c.moveTo(56, 40.5); c.lineTo(58, 35.5); c.lineTo(59.5, 40); c.closePath(); c.moveTo(51, 41.5); c.lineTo(52.5, 37); c.lineTo(54, 41.5); c.closePath(); });
      if (gear === 'helm') {
        for (const [x, dir] of [[43, -1], [58, 1]] as const) {
          shape(p, '#e8dcc0', (c) => { c.moveTo(x, 25); c.quadraticCurveTo(x + dir * 10, 20, x + dir * 8, 8); c.quadraticCurveTo(x + dir * 5, 18, x + dir * -2, 22); c.closePath(); });
        }
        shape(p, helmFill, (c) => { c.moveTo(41, 30); c.bezierCurveTo(41, 17, 62, 17, 62, 30); c.closePath(); });
        shape(p, a.trim, (c) => c.rect(41, 28.5, 21, 2.5));
      } else {
        shape(p, '#e8dcc0', (c) => { c.moveTo(44, 27); c.quadraticCurveTo(38, 14, 44, 10); c.quadraticCurveTo(46, 18, 49, 25); c.closePath(); });
        shape(p, r.cloth, (c) => { c.moveTo(41, 29); c.bezierCurveTo(41, 19, 62, 19, 62, 28); c.closePath(); });
      }
      break;
    case 'undead':
      shape(p, r.skin, (c) => { c.arc(51, 31, 9, Math.PI * 0.85, Math.PI * 2.15); c.lineTo(58, 42); c.lineTo(47, 42); c.closePath(); });
      p.c.save();
      p.c.shadowColor = r.magic;
      p.c.shadowBlur = 8;
      shape(p, '#12141a', (c) => { c.ellipse(55.5, 31, 2.4, 3, 0, 0, Math.PI * 2); c.moveTo(50.5, 31); c.ellipse(49.5, 31, 2, 3, 0, 0, Math.PI * 2); }, false);
      shape(p, r.magic, (c) => { c.arc(55.5, 31.5, 1, 0, Math.PI * 2); c.moveTo(50, 31.5); c.arc(49.5, 31.5, 0.9, 0, Math.PI * 2); }, false);
      p.c.restore();
      shape(p, OUTLINE, (c) => { for (let x = 49; x <= 57; x += 2.2) c.rect(x, 38, 0.8, 3.5); }, false);
      if (gear === 'helm') {
        shape(p, helmFill, (c) => {
          c.moveTo(41, 30);
          for (const [x, y] of [[43, 18], [46, 26], [50, 14], [54, 26], [58, 18], [61, 30]] as const) c.lineTo(x, y);
          c.closePath();
        });
        gem(p, 50.5, 24, 1.8);
      } else {
        shape(p, cloth(p, 16, 46), (c) => { c.moveTo(39, 46); c.bezierCurveTo(34, 20, 50, 12, 62, 20); c.lineTo(63, 30); c.bezierCurveTo(56, 22, 46, 24, 44, 44); c.closePath(); });
      }
      break;
    case 'dwarf':
      shape(p, r.skin, (c) => c.arc(52, 31, 7.5, 0, Math.PI * 2));
      shape(p, OUTLINE, (c) => c.arc(56, 29.5, 1, 0, Math.PI * 2), false);
      shape(p, r.hair, (c) => { c.moveTo(44, 32); c.quadraticCurveTo(47, 58, 53, 60); c.quadraticCurveTo(61, 54, 61, 32); c.quadraticCurveTo(54, 38, 44, 32); c.closePath(); });
      shape(p, a.gems ? '#ffd24a' : a.trim, (c) => { c.rect(49.5, 48, 5, 2.4); c.rect(50, 54, 4.5, 2.2); });
      if (gear === 'helm') {
        shape(p, helmFill, (c) => { c.moveTo(42, 30); c.bezierCurveTo(42, 16, 62, 16, 62, 30); c.closePath(); });
        shape(p, a.trim, (c) => { c.rect(41, 28.5, 22, 3); c.rect(56.5, 29, 2.5, 7); });
        if (a.plume) {
          for (const dir of [-1, 1]) {
            shape(p, '#efe6cf', (c) => { c.moveTo(52 + dir * 8, 24); c.quadraticCurveTo(52 + dir * 16, 16, 52 + dir * 12, 8); c.quadraticCurveTo(52 + dir * 10, 16, 52 + dir * 5, 20); c.closePath(); });
          }
        }
      } else {
        shape(p, cloth(p, 18, 34), (c) => { c.moveTo(42, 31); c.bezierCurveTo(40, 18, 62, 16, 62, 30); c.closePath(); });
      }
      break;
  }
}

function robe(p: Painter, white: boolean): void {
  const g = p.c.createLinearGradient(0, 46, 0, 90);
  g.addColorStop(0, white ? '#f4efe2' : p.r.cloth);
  g.addColorStop(1, white ? '#b9b09a' : p.r.clothDark);
  shape(p, g, (c) => { c.moveTo(38, 46); c.lineTo(62, 46); c.lineTo(69, 90); c.lineTo(31, 90); c.closePath(); });
  shape(p, white ? cloth(p, 46, 90) : p.a.trim, (c) => { c.moveTo(47, 46); c.lineTo(53, 46); c.lineTo(55, 90); c.lineTo(45, 90); c.closePath(); });
  shape(p, p.a.trim, (c) => c.rect(31.5, 86, 37, 4));
  drawEmblem(p.c, p.race, 50, 58, 5, white ? p.r.accent : p.r.accent);
  if (p.a.glow) glowLine(p, p.a.glow, 7, (c) => { c.moveTo(35, 78); c.lineTo(40, 74); c.lineTo(38, 82); c.moveTo(65, 78); c.lineTo(60, 74); c.lineTo(62, 82); });
}

// ---------- Unidades ----------

// ---------- Comandantes y jefes ----------

function drawCommander(p: Painter, id: keyof typeof COMMANDERS): void {
  const def = COMMANDERS[id];
  // Los comandantes siempre llevan capa y penacho, sea cual sea la armadura.
  const lord: Painter = { ...p, a: { ...p.a, cape: true, plume: true } };
  DRAW[def.archetype](lord);
  const { c } = p;
  const top = def.archetype === 'knight' ? 20 : 14;
  c.save();
  c.shadowColor = '#ffd24a';
  c.shadowBlur = 8;
  const g = c.createLinearGradient(0, top - 8, 0, top + 4);
  g.addColorStop(0, '#fff3b0');
  g.addColorStop(1, '#c9962e');
  shape(p, g, (c) => {
    c.moveTo(41, top + 4); c.lineTo(40, top - 5); c.lineTo(45, top - 1); c.lineTo(50.5, top - 9);
    c.lineTo(56, top - 1); c.lineTo(61, top - 5); c.lineTo(60, top + 4); c.closePath();
  });
  c.restore();
  shape(p, '#e0245e', (c) => c.arc(50.5, top, 1.8, 0, Math.PI * 2), false);
  shape(p, '#46c8ff', (c) => { c.arc(44.5, top + 1.5, 1.2, 0, Math.PI * 2); c.moveTo(57.7, top + 1.5); c.arc(56.5, top + 1.5, 1.2, 0, Math.PI * 2); }, false);
}

function drawDragon(p: Painter): void {
  const { c } = p;
  const scale = (x0: number, y0: number, x1: number, y1: number) => {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, '#5a2a1c');
    g.addColorStop(0.5, '#2b1512');
    g.addColorStop(1, '#0d0707');
    return g;
  };
  // Ala trasera.
  shape(p, '#3a1210', (c) => { c.moveTo(44, 48); c.lineTo(30, 6); c.lineTo(22, 22); c.lineTo(14, 16); c.lineTo(16, 40); c.closePath(); });
  // Cola.
  shape(p, scale(0, 55, 30, 80), (c) => { c.moveTo(30, 62); c.quadraticCurveTo(10, 70, 2, 54); c.lineTo(6, 52); c.quadraticCurveTo(14, 64, 30, 56); c.closePath(); });
  // Patas.
  for (const x of [32, 54]) shape(p, scale(x, 70, x + 10, 92), (c) => { c.roundRect(x, 70, 10, 18, 4); });
  shape(p, '#e8dcc0', (c) => { for (const x of [32, 54]) { c.moveTo(x + 10, 88); c.lineTo(x + 14, 91); c.lineTo(x + 8, 90); } });
  // Cuerpo.
  shape(p, scale(24, 48, 70, 80), (c) => c.ellipse(46, 64, 24, 14, 0, 0, Math.PI * 2));
  shape(p, '#8a4a2a', (c) => c.ellipse(48, 70, 16, 6, 0, 0, Math.PI * 2), false);
  // Cuello y cabeza.
  shape(p, scale(56, 30, 80, 64), (c) => { c.moveTo(58, 60); c.quadraticCurveTo(62, 40, 74, 30); c.lineTo(80, 36); c.quadraticCurveTo(70, 46, 68, 62); c.closePath(); });
  shape(p, scale(70, 22, 98, 42), (c) => { c.moveTo(70, 26); c.lineTo(92, 28); c.lineTo(98, 34); c.lineTo(88, 38); c.lineTo(94, 42); c.lineTo(78, 42); c.lineTo(70, 36); c.closePath(); });
  shape(p, '#e8dcc0', (c) => { c.moveTo(74, 26); c.quadraticCurveTo(64, 16, 58, 18); c.quadraticCurveTo(66, 20, 72, 30); c.closePath(); c.moveTo(80, 26); c.quadraticCurveTo(76, 12, 70, 10); c.quadraticCurveTo(76, 16, 78, 28); c.closePath(); });
  c.save();
  c.shadowColor = '#ffb020';
  c.shadowBlur = 10;
  shape(p, '#ffd24a', (c) => c.ellipse(84, 31, 2.4, 1.4, 0, 0, Math.PI * 2), false);
  shape(p, '#ff6a1a', (c) => { c.moveTo(90, 38); c.lineTo(99, 39); c.lineTo(92, 41); c.closePath(); }, false);
  c.restore();
  // Ala delantera.
  shape(p, '#5a1a14', (c) => { c.moveTo(48, 52); c.lineTo(62, 2); c.lineTo(70, 18); c.lineTo(82, 12); c.lineTo(74, 34); c.lineTo(60, 48); c.closePath(); });
  c.strokeStyle = '#1a0806';
  c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(50, 50); c.lineTo(62, 4); c.moveTo(52, 50); c.lineTo(70, 18); c.moveTo(56, 48); c.lineTo(80, 14); c.stroke();
  // Grietas de lava.
  glowLine(p, '#ff7a1a', 8, (c) => { c.moveTo(30, 60); c.lineTo(38, 64); c.lineTo(34, 70); c.moveTo(50, 56); c.lineTo(56, 62); c.lineTo(52, 68); c.moveTo(62, 50); c.lineTo(66, 42); }, 1.6);
}

function drawColossus(p: Painter): void {
  const { c } = p;
  const stone = (x0: number, y0: number, x1: number, y1: number) => {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, '#4a3a5e');
    g.addColorStop(0.5, '#1f1728');
    g.addColorStop(1, '#07050a');
    return g;
  };
  const glow = '#b56bff';
  shape(p, stone(34, 66, 66, 94), (c) => { c.roundRect(32, 66, 14, 24, 4); c.roundRect(54, 66, 14, 24, 4); });
  shape(p, stone(18, 24, 82, 76), (c) => { c.moveTo(22, 40); c.quadraticCurveTo(50, 12, 78, 40); c.lineTo(72, 72); c.quadraticCurveTo(50, 80, 28, 72); c.closePath(); });
  shape(p, stone(4, 34, 26, 84), (c) => c.ellipse(14, 58, 11, 18, 0.25, 0, Math.PI * 2));
  shape(p, stone(74, 34, 98, 84), (c) => c.ellipse(86, 58, 11, 18, -0.25, 0, Math.PI * 2));
  shape(p, stone(38, 8, 62, 34), (c) => { c.moveTo(38, 30); c.lineTo(42, 10); c.lineTo(50, 4); c.lineTo(58, 10); c.lineTo(62, 30); c.closePath(); });
  glowLine(p, glow, 12, (c) => {
    c.moveTo(34, 44); c.lineTo(44, 52); c.lineTo(38, 62);
    c.moveTo(66, 44); c.lineTo(56, 54); c.lineTo(62, 64);
    c.moveTo(50, 36); c.lineTo(50, 70); c.moveTo(10, 50); c.lineTo(18, 60); c.moveTo(90, 50); c.lineTo(82, 60);
  }, 2);
  orb(p, 50, 20, 5, glow);
}

const DRAW: Record<UnitType, (p: Painter) => void> = {
  // Plantillas: comandantes y jefes se dibujan con drawCommander / drawDragon / drawColossus.
  commander(p) { DRAW.guardian(p); },
  boss(p) { drawColossus(p); },
  warrior(p) {
    cape(p);
    shape(p, metal(p, 28, 48, 44, 64), (c) => c.arc(35, 57, 8.5, 0, Math.PI * 2));
    shape(p, p.a.trim, (c) => c.arc(35, 57, 2.6, 0, Math.PI * 2));
    legs(p);
    torso(p);
    pauldrons(p, 7);
    head(p, 'helm');
    sword(p, 63, 60, 84, 26);
  },
  archer(p) {
    shape(p, '#6b4524', (c) => { c.moveTo(36, 40); c.lineTo(41, 38); c.lineTo(45, 66); c.lineTo(40, 68); c.closePath(); });
    shape(p, p.r.accent, (c) => { c.moveTo(35, 36); c.lineTo(38, 30); c.lineTo(41, 36); c.moveTo(38, 37); c.lineTo(41, 31); c.lineTo(44, 36); });
    cape(p);
    legs(p);
    torso(p, true);
    pauldrons(p, 5);
    head(p, p.race === 'human' || p.race === 'dwarf' ? 'hood' : 'helm');
    // Arco tensado con flecha.
    const wood = p.a.gems ? '#d4a73a' : '#7a4a22';
    p.c.lineWidth = 3.2;
    p.c.strokeStyle = OUTLINE;
    p.c.beginPath(); p.c.moveTo(66, 24); p.c.quadraticCurveTo(84, 52, 66, 80); p.c.stroke();
    p.c.lineWidth = 2;
    p.c.strokeStyle = wood;
    p.c.beginPath(); p.c.moveTo(66, 24); p.c.quadraticCurveTo(84, 52, 66, 80); p.c.stroke();
    p.c.lineWidth = 0.8;
    p.c.strokeStyle = '#e8e2d0';
    p.c.beginPath(); p.c.moveTo(66, 24); p.c.lineTo(56, 52); p.c.lineTo(66, 80); p.c.stroke();
    shape(p, '#5a3a1e', (c) => c.rect(56, 51.2, 30, 1.8));
    shape(p, p.a.glow ?? '#d9dde2', (c) => { c.moveTo(86, 52); c.lineTo(81, 48.5); c.lineTo(81, 55.5); c.closePath(); });
    shape(p, p.r.skin, (c) => c.arc(73, 52, 3, 0, Math.PI * 2));
  },
  knight(p) {
    mount(p);
    // Jinete sentado sobre la barda: pierna al costado y torso escalado.
    shape(p, metal(p, 44, 58, 54, 76), (c) => { c.moveTo(45, 60); c.lineTo(52, 60); c.lineTo(54, 74); c.lineTo(58, 76); c.lineTo(58, 79); c.lineTo(49, 79); c.closePath(); });
    p.c.save();
    p.c.translate(48, 72);
    p.c.scale(0.74, 0.74);
    p.c.translate(-50, -90);
    cape(p);
    torso(p);
    pauldrons(p, 8);
    head(p, 'helm');
    p.c.restore();
    // Lanza con estandarte.
    shape(p, metal(p, 50, 30, 98, 60), (c) => { c.moveTo(50, 60); c.lineTo(97, 42); c.lineTo(98.5, 44.5); c.lineTo(51, 63); c.closePath(); });
    shape(p, p.a.light, (c) => { c.moveTo(97, 42); c.lineTo(100.5, 42); c.lineTo(98.5, 44.5); c.closePath(); });
    shape(p, cloth(p, 44, 60), (c) => { c.moveTo(82, 48); c.lineTo(70, 52.5); c.lineTo(72, 60); c.lineTo(77, 55); c.lineTo(84, 56); c.closePath(); });
    shape(p, p.r.skin, (c) => c.arc(58, 58, 2.8, 0, Math.PI * 2));
    shape(p, metal(p, 36, 52, 48, 70), (c) => { c.moveTo(36, 54); c.lineTo(48, 54); c.lineTo(48, 64); c.quadraticCurveTo(42, 71, 36, 64); c.closePath(); });
    drawEmblem(p.c, p.race, 42, 60, 4.5, p.r.accent);
  },
  guardian(p) {
    cape(p);
    legs(p);
    torso(p);
    pauldrons(p, 10);
    head(p, 'helm');
    // Escudo torre.
    shape(p, metal(p, 54, 34, 78, 88), (c) => c.roundRect(55, 36, 22, 50, [9, 9, 4, 4]));
    shape(p, cloth(p, 40, 84), (c) => c.roundRect(58.5, 40, 15, 42, [7, 7, 3, 3]));
    drawEmblem(p.c, p.race, 66, 58, 9, p.r.accent);
    p.c.lineWidth = 2.2;
    p.c.strokeStyle = p.a.trim;
    p.c.beginPath();
    p.c.roundRect(56.5, 37.5, 19, 47, [8, 8, 3, 3]);
    p.c.stroke();
    if (p.a.glow) glowLine(p, p.a.glow, 8, (c) => c.roundRect(58, 39, 16, 44, [7, 7, 3, 3]), 1);
    gem(p, 66, 44, 2.4);
  },
  mage(p) {
    cape(p);
    robe(p, false);
    pauldrons(p, 5);
    head(p, 'hood');
    staff(p, p.a.glow ?? p.r.magic, 'orb');
  },
  healer(p) {
    cape(p);
    robe(p, true);
    head(p, 'hood');
    staff(p, '#b9ffcf', 'sun');
  },
  golem(p) {
    const stone = (x0: number, y0: number, x1: number, y1: number) => {
      const g = p.c.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, '#bfb4a0');
      g.addColorStop(0.5, '#7d7468');
      g.addColorStop(1, '#3a342c');
      return g;
    };
    const rune = p.a.glow ?? p.r.magic;
    shape(p, stone(36, 68, 64, 92), (c) => { c.roundRect(34, 70, 13, 20, 4); c.roundRect(53, 70, 13, 20, 4); });
    shape(p, stone(22, 30, 78, 76), (c) => { c.moveTo(26, 44); c.quadraticCurveTo(50, 22, 76, 44); c.lineTo(70, 74); c.quadraticCurveTo(50, 82, 30, 74); c.closePath(); });
    shape(p, stone(12, 40, 30, 80), (c) => c.ellipse(20, 60, 10, 15, 0.2, 0, Math.PI * 2));
    shape(p, stone(70, 40, 92, 80), (c) => c.ellipse(82, 60, 11, 15, -0.2, 0, Math.PI * 2));
    shape(p, stone(40, 16, 60, 38), (c) => c.roundRect(40, 18, 21, 19, 6));
    shape(p, '#4f7d3a', (c) => { c.ellipse(34, 46, 5, 2.5, 0.3, 0, Math.PI * 2); c.moveTo(70, 66); c.ellipse(66, 66, 4, 2, -0.2, 0, Math.PI * 2); }, false);
    glowLine(p, rune, 10, (c) => {
      c.moveTo(38, 50); c.lineTo(46, 56); c.lineTo(42, 64);
      c.moveTo(60, 48); c.lineTo(55, 57); c.lineTo(62, 64);
      c.moveTo(50, 42); c.lineTo(50, 70);
      c.moveTo(16, 56); c.lineTo(22, 62); c.moveTo(80, 54); c.lineTo(86, 62);
    }, 1.8);
    p.c.save();
    p.c.shadowColor = rune;
    p.c.shadowBlur = 10;
    shape(p, rune, (c) => { c.rect(45, 25, 4, 3); c.rect(53, 25, 4, 3); }, false);
    p.c.restore();
  },
};

function sword(p: Painter, hx: number, hy: number, tx: number, ty: number): void {
  const { c } = p;
  const ang = Math.atan2(ty - hy, tx - hx);
  c.save();
  c.translate(hx, hy);
  c.rotate(ang);
  const len = Math.hypot(tx - hx, ty - hy);
  if (p.a.glow) {
    c.shadowColor = p.a.glow;
    c.shadowBlur = 10;
  }
  const g = c.createLinearGradient(0, -3, 0, 3);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, p.a.glow === '#ff6a1a' ? '#ffb070' : '#cfd8e3');
  g.addColorStop(1, '#6b7684');
  shape(p, g, (c) => { c.moveTo(4, -2.4); c.lineTo(len - 5, -2.4); c.lineTo(len, 0); c.lineTo(len - 5, 2.4); c.lineTo(4, 2.4); c.closePath(); });
  c.shadowBlur = 0;
  shape(p, p.a.gems ? '#ffd24a' : p.a.trim, (c) => { c.rect(2, -6.5, 3, 13); c.rect(-5, -1.6, 7, 3.2); });
  c.restore();
  shape(p, p.a.base, (c) => c.arc(hx, hy, 3.2, 0, Math.PI * 2));
}

function staff(p: Painter, color: string, top: 'orb' | 'sun'): void {
  shape(p, p.a.gems ? '#d4a73a' : '#6b4524', (c) => c.rect(68.5, 22, 3, 68));
  shape(p, p.r.skin, (c) => c.arc(70, 58, 3.2, 0, Math.PI * 2));
  if (top === 'orb') {
    shape(p, p.a.trim, (c) => { c.moveTo(64, 24); c.quadraticCurveTo(70, 30, 76, 24); c.lineTo(74, 22); c.quadraticCurveTo(70, 26, 66, 22); c.closePath(); });
    orb(p, 70, 16, 6.5, color);
  } else {
    glowLine(p, '#ffe27a', 10, (c) => c.arc(70, 16, 7, 0, Math.PI * 2), 2.2);
    glowLine(p, '#ffe27a', 6, (c) => {
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        c.moveTo(70 + Math.cos(a) * 9, 16 + Math.sin(a) * 9);
        c.lineTo(70 + Math.cos(a) * 12, 16 + Math.sin(a) * 12);
      }
    }, 1.4);
    orb(p, 70, 16, 3.5, color);
  }
}

const MOUNTS: Record<Race, { body: string; mane: string; glow?: boolean }> = {
  human: { body: '#ece7dc', mane: '#c9bfae' },
  elf: { body: '#d8e3ea', mane: '#f7f3d8' },
  orc: { body: '#4a4540', mane: '#1d1a17' },
  undead: { body: '#cfc9b4', mane: '#5ff5d6', glow: true },
  dwarf: { body: '#8a5a33', mane: '#3d2413' },
};

function mount(p: Painter): void {
  const m = MOUNTS[p.race];
  const g = p.c.createLinearGradient(0, 56, 0, 92);
  g.addColorStop(0, m.body);
  g.addColorStop(1, shade(m.body, -0.45));
  for (const x of [30, 38, 58, 66]) shape(p, g, (c) => c.rect(x, 74, 5, 16));
  shape(p, '#1d1a17', (c) => { for (const x of [30, 38, 58, 66]) c.rect(x - 0.5, 87, 6, 3.5); });
  shape(p, m.mane, (c) => { c.moveTo(24, 66); c.quadraticCurveTo(12, 70, 16, 86); c.quadraticCurveTo(22, 76, 27, 72); c.closePath(); });
  shape(p, g, (c) => c.ellipse(48, 70, 24, 11, 0, 0, Math.PI * 2));
  shape(p, g, (c) => { c.moveTo(62, 68); c.lineTo(72, 48); c.quadraticCurveTo(78, 44, 86, 50); c.lineTo(88, 56); c.quadraticCurveTo(82, 58, 78, 56); c.lineTo(72, 70); c.closePath(); });
  p.c.save();
  if (m.glow) {
    p.c.shadowColor = m.mane;
    p.c.shadowBlur = 10;
  }
  shape(p, m.mane, (c) => { c.moveTo(70, 48); c.quadraticCurveTo(62, 52, 60, 64); c.lineTo(66, 60); c.quadraticCurveTo(68, 54, 74, 50); c.closePath(); });
  p.c.restore();
  shape(p, p.race === 'undead' ? p.r.magic : '#1a1a1a', (c) => c.arc(80, 50.5, 1.3, 0, Math.PI * 2), false);
  // Barda (manta de guerra) con los colores de la raza.
  shape(p, cloth(p, 60, 84), (c) => { c.moveTo(28, 64); c.quadraticCurveTo(48, 58, 68, 64); c.lineTo(66, 80); c.lineTo(58, 76); c.lineTo(50, 81); c.lineTo(42, 76); c.lineTo(34, 81); c.lineTo(28, 76); c.closePath(); });
  drawEmblem(p.c, p.race, 48, 70, 6, p.r.accent);
  shape(p, metal(p, 70, 44, 88, 56), (c) => { c.moveTo(74, 47); c.quadraticCurveTo(80, 43, 87, 50); c.lineTo(80, 50); c.closePath(); });
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amount < 0 ? v * amount : (255 - v) * amount))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
