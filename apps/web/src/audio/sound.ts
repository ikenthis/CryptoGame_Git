// Sonido 100% sintetizado con Web Audio: no hay archivos que descargar ni
// licencias que gestionar. Cada efecto es una pequeña receta de osciladores y
// ruido filtrado; la música se compone en tiempo real con un secuenciador.

export type Sfx =
  | 'click' | 'place' | 'remove' | 'swing' | 'hit' | 'heavy' | 'arrow' | 'magic' | 'fireball' | 'explosion'
  | 'lightning' | 'heal' | 'buff' | 'freeze' | 'death' | 'rise' | 'summon' | 'card' | 'legendary'
  | 'victory' | 'defeat' | 'turn';

export type Mood = 'menu' | 'battle';

interface ToneOptions {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  glide?: number;
  filter?: number;
  detune?: number;
  delay?: number;
}

const NOTE = (semitonesFromA4: number) => 440 * Math.pow(2, semitonesFromA4 / 12);
// Re menor natural para la música, relativo a A4.
const D = { d2: -31, a2: -24, bb2: -23, c3: -21, d3: -19, e3: -17, f3: -16, g3: -14, a3: -12, bb3: -11, c4: -9, d4: -7, e4: -5, f4: -4, a4: 0 };

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private lastPlayed = new Map<Sfx, number>();
  private muted: boolean;
  private mood: Mood | null = null;
  private wantedMood: Mood | null = null;
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private drone: { stop: () => void } | null = null;

  constructor() {
    this.muted = readMuted();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** El navegador solo permite audio tras un gesto del usuario: llamar en el primer clic. */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.55;
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.2;
      this.musicBus.connect(this.master);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.wantedMood && this.mood !== this.wantedMood) this.setMusic(this.wantedMood);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try { localStorage.setItem('gentium.muted', muted ? '1' : '0'); } catch { /* opcional */ }
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  play(name: Sfx, intensity = 1): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    // Evita saturar cuando muchas unidades hacen lo mismo a la vez (o a velocidad ×4).
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? 0) < 45) return;
    this.lastPlayed.set(name, now);
    const k = Math.max(0.2, Math.min(1.5, intensity));
    RECIPES[name](this, k);
  }

  setMusic(mood: Mood | null): void {
    this.wantedMood = mood;
    if (!this.ctx || this.mood === mood) return;
    this.stopMusic();
    this.mood = mood;
    if (!mood) return;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.drone = this.startDrone(mood);
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  // ---------- Primitivas ----------

  tone(freq: number, dur: number, o: ToneOptions = {}, bus: 'sfx' | 'music' = 'sfx'): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.glide), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    const peak = o.gain ?? 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.filter;
      node = node.connect(f);
    }
    node.connect(g).connect(bus === 'sfx' ? this.sfxBus : this.musicBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noiseBurst(dur: number, o: { type?: BiquadFilterType; freq?: number; to?: number; q?: number; gain?: number; delay?: number; attack?: number } = {}, bus: 'sfx' | 'music' = 'sfx'): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq ?? 1000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.3, t + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus === 'sfx' ? this.sfxBus : this.musicBus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  chord(semitones: number[], dur: number, o: ToneOptions = {}, bus: 'sfx' | 'music' = 'sfx'): void {
    for (const [i, s] of semitones.entries()) this.tone(NOTE(s), dur, { ...o, detune: (i % 2 ? 6 : -6) }, bus);
  }

  // ---------- Música ----------

  private startDrone(mood: Mood): { stop: () => void } {
    const ctx = this.ctx!;
    const oscs = [NOTE(D.d2), NOTE(D.a2) * 1.002].map((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      return o;
    });
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = mood === 'battle' ? 380 : 240;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(filter.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(mood === 'battle' ? 0.22 : 0.16, ctx.currentTime + 2);
    for (const o of oscs) o.connect(filter);
    filter.connect(g).connect(this.musicBus);
    for (const o of [...oscs, lfo]) o.start();
    return {
      stop: () => {
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
        for (const o of [...oscs, lfo]) o.stop(ctx.currentTime + 1.5);
      },
    };
  }

  private stopMusic(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.drone?.stop();
    this.drone = null;
  }

  /** Secuenciador con planificación anticipada (lookahead) para un tempo estable. */
  private schedule(): void {
    const ctx = this.ctx!;
    const battle = this.mood === 'battle';
    const stepDur = 60 / (battle ? 96 : 66) / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const delay = Math.max(0, this.nextTime - ctx.currentTime);
      this.musicStep(this.step, delay, battle, stepDur);
      this.step = (this.step + 1) % 256;
      this.nextTime += stepDur;
    }
  }

  private musicStep(step: number, delay: number, battle: boolean, stepDur: number): void {
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    // Progresión Re menor – Si♭ – Do – La.
    const roots = [D.d3, D.bb2, D.c3, D.a2];
    const root = roots[bar];
    if (battle) {
      if ([0, 6, 8, 11].includes(s)) this.tone(110, 0.3, { glide: 42, gain: 0.55, delay }, 'music');
      if (s === 4 || s === 12) this.noiseBurst(0.18, { type: 'bandpass', freq: 900, q: 0.8, gain: 0.25, delay }, 'music');
      if (s % 2 === 1) this.noiseBurst(0.04, { type: 'highpass', freq: 7000, gain: 0.05, delay }, 'music');
      const riff = [0, 3, 7, 12, 10, 7, 3, 5];
      if (s % 2 === 0) this.tone(NOTE(root + 12 + riff[(s / 2) % 8]), stepDur * 1.8, { type: 'triangle', gain: 0.12, filter: 1800, delay }, 'music');
      if (s === 0) this.chord([root, root + 7, root + 12], stepDur * 15, { type: 'sawtooth', gain: 0.035, filter: 900, attack: 0.3, delay }, 'music');
    } else {
      if (s === 0) this.chord([root + 12, root + 15 + (bar === 3 ? 1 : 0), root + 19], stepDur * 16, { type: 'triangle', gain: 0.05, attack: 1.2, filter: 1400, delay }, 'music');
      if (s % 4 === 2 && Math.random() < 0.6) {
        const scale = [0, 2, 3, 5, 7, 8, 10, 12];
        this.tone(NOTE(D.d4 + scale[Math.floor(Math.random() * scale.length)]), 1.4, { type: 'sine', gain: 0.07, attack: 0.01, delay }, 'music');
      }
    }
  }
}

type Recipe = (e: SoundEngine, k: number) => void;

const RECIPES: Record<Sfx, Recipe> = {
  click: (e) => e.tone(1200, 0.05, { gain: 0.08 }),
  place: (e) => {
    e.tone(150, 0.18, { glide: 60, gain: 0.4 });
    e.noiseBurst(0.12, { type: 'lowpass', freq: 900, gain: 0.25 });
  },
  remove: (e) => e.tone(320, 0.12, { type: 'triangle', glide: 140, gain: 0.15 }),
  swing: (e, k) => e.noiseBurst(0.18, { freq: 1400, to: 380, q: 1.4, gain: 0.22 * k }),
  hit: (e, k) => {
    e.noiseBurst(0.08, { freq: 2200, q: 0.9, gain: 0.35 * k });
    e.tone(170, 0.1, { type: 'square', glide: 80, gain: 0.12 * k, filter: 1200 });
    e.tone(1046, 0.22, { gain: 0.05 * k });
  },
  heavy: (e, k) => {
    e.tone(95, 0.45, { glide: 38, gain: 0.7 * k });
    e.noiseBurst(0.3, { type: 'lowpass', freq: 700, to: 150, gain: 0.5 * k });
    e.tone(784, 0.35, { gain: 0.08 * k, type: 'triangle' });
  },
  arrow: (e) => {
    e.noiseBurst(0.2, { type: 'highpass', freq: 2500, to: 5000, gain: 0.12 });
    e.tone(1900, 0.18, { glide: 900, gain: 0.04 });
  },
  magic: (e) => {
    e.tone(600, 0.35, { glide: 1250, gain: 0.08, type: 'sine' });
    e.tone(900, 0.3, { glide: 1800, gain: 0.05, type: 'triangle', delay: 0.04 });
  },
  fireball: (e) => {
    e.noiseBurst(0.55, { type: 'lowpass', freq: 400, to: 1400, gain: 0.3, attack: 0.1 });
    e.tone(180, 0.5, { glide: 70, gain: 0.12, type: 'sawtooth', filter: 600 });
  },
  explosion: (e, k) => {
    e.noiseBurst(1.3, { type: 'lowpass', freq: 900, to: 90, gain: 0.8 * k });
    e.tone(70, 0.9, { glide: 28, gain: 0.8 * k });
  },
  lightning: (e) => {
    for (let i = 0; i < 5; i++) e.noiseBurst(0.05, { type: 'highpass', freq: 1800 + i * 300, gain: 0.3, delay: i * 0.035 });
    e.tone(80, 0.35, { type: 'sawtooth', gain: 0.15, filter: 500 });
  },
  heal: (e) => {
    [3, 7, 10, 15].forEach((s, i) => e.tone(NOTE(s + 12), 0.5, { gain: 0.08, delay: i * 0.07 }));
  },
  buff: (e) => {
    e.tone(440, 0.28, { type: 'triangle', glide: 880, gain: 0.1 });
    e.tone(660, 0.28, { type: 'triangle', glide: 1320, gain: 0.06, delay: 0.05 });
  },
  freeze: (e) => {
    [2093, 2637, 3136].forEach((f, i) => e.tone(f, 0.6, { gain: 0.05, detune: i * 7, delay: i * 0.03 }));
    e.noiseBurst(0.35, { type: 'highpass', freq: 6000, gain: 0.12 });
  },
  death: (e) => {
    e.tone(240, 0.5, { type: 'sawtooth', glide: 55, gain: 0.12, filter: 900 });
    e.noiseBurst(0.3, { type: 'lowpass', freq: 600, gain: 0.2 });
  },
  rise: (e) => {
    e.tone(110, 0.9, { glide: 220, gain: 0.15, type: 'sine', attack: 0.2 });
    e.tone(165, 0.9, { glide: 330, gain: 0.08, type: 'triangle', attack: 0.2, detune: 15 });
  },
  summon: (e) => {
    e.tone(50, 0.9, { gain: 0.5, attack: 0.1 });
    e.tone(100, 0.7, { glide: 420, gain: 0.1, type: 'sawtooth', filter: 1200, attack: 0.2 });
    [0, 7, 12].forEach((s, i) => e.tone(NOTE(s + 3), 0.6, { gain: 0.07, delay: 0.5 + i * 0.06 }));
  },
  card: (e) => {
    e.noiseBurst(0.3, { freq: 500, to: 3500, q: 2, gain: 0.12 });
    e.tone(NOTE(7), 0.35, { gain: 0.08, delay: 0.12 });
    e.tone(NOTE(12), 0.45, { gain: 0.08, delay: 0.2 });
  },
  legendary: (e) => {
    e.tone(82, 1.2, { glide: 60, gain: 0.7 });
    e.chord([-12, -8, -5, 0, 4], 2.2, { type: 'sawtooth', gain: 0.045, filter: 1900, attack: 0.25 });
    [12, 16, 19, 24].forEach((s, i) => e.tone(NOTE(s), 0.9, { gain: 0.06, delay: 0.15 + i * 0.09 }));
  },
  victory: (e) => {
    [-9, -5, -2, 3].forEach((s, i) => e.tone(NOTE(s), 0.22, { type: 'sawtooth', gain: 0.12, filter: 2200, delay: i * 0.14 }));
    e.chord([-9, -5, -2, 3], 1.6, { type: 'sawtooth', gain: 0.06, filter: 2200, delay: 0.6, attack: 0.05 });
    e.tone(65, 1, { glide: 50, gain: 0.5, delay: 0.6 });
  },
  defeat: (e) => {
    [0, -4, -7].forEach((s, i) => e.tone(NOTE(s - 12), 0.5, { type: 'sawtooth', gain: 0.1, filter: 900, delay: i * 0.35 }));
    e.chord([-19, -16, -12], 2, { type: 'triangle', gain: 0.07, delay: 1.05, attack: 0.1 });
  },
  turn: (e) => e.tone(140, 0.12, { glide: 70, gain: 0.25 }),
};

function readMuted(): boolean {
  try {
    return localStorage.getItem('gentium.muted') === '1';
  } catch {
    return false;
  }
}

export const sound = new SoundEngine();
