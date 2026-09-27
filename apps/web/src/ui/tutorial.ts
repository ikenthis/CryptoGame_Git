// Tutorial guiado: ilumina un elemento, explica qué hacer y avanza solo cuando
// el jugador lo hace (o con «Siguiente» en los pasos informativos).

export interface TutorialStep {
  /** Selector CSS del elemento a iluminar; sin él, el mensaje va centrado. */
  target?: string;
  title: string;
  text: string;
  /** Si existe, el paso avanza solo cuando devuelve true. */
  done?: () => boolean;
  onEnter?: () => void;
  /** Texto del botón principal en pasos sin `done`. */
  next?: string;
}

const STORAGE_KEY = 'gentium.tutorial';

export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'done';
  } catch {
    return true;
  }
}

export class Tutorial {
  private readonly steps: TutorialStep[];
  private index = -1;
  private timer: number | null = null;
  private root: HTMLElement | null = null;
  private spot!: HTMLElement;
  private dim!: HTMLElement;
  private bubble!: HTMLElement;
  onChange?: (active: boolean) => void;

  constructor(steps: TutorialStep[]) {
    this.steps = steps;
  }

  get active(): boolean {
    return this.root !== null;
  }

  start(): void {
    this.stop(false);
    this.root = document.createElement('div');
    this.root.className = 'tut';
    this.root.innerHTML = '<div class="tut-dim"></div><div class="tut-spot"></div><div class="tut-bubble" role="dialog" aria-live="polite"></div>';
    document.body.append(this.root);
    this.dim = this.root.querySelector('.tut-dim')!;
    this.spot = this.root.querySelector('.tut-spot')!;
    this.bubble = this.root.querySelector('.tut-bubble')!;
    this.index = -1;
    this.go(0);
    this.timer = window.setInterval(() => this.tick(), 250);
    window.addEventListener('resize', this.layout);
    window.addEventListener('scroll', this.layout, true);
    this.onChange?.(true);
  }

  stop(completed: boolean): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    window.removeEventListener('resize', this.layout);
    window.removeEventListener('scroll', this.layout, true);
    this.root?.remove();
    const wasActive = this.root !== null;
    this.root = null;
    if (completed) {
      try { localStorage.setItem(STORAGE_KEY, 'done'); } catch { /* opcional */ }
    }
    if (wasActive) this.onChange?.(false);
  }

  private go(i: number): void {
    if (i >= this.steps.length) return this.stop(true);
    this.index = i;
    const step = this.steps[i];
    step.onEnter?.();
    const last = i === this.steps.length - 1;
    this.bubble.innerHTML = `
      <div class="tut-progress">${i + 1} / ${this.steps.length}</div>
      <h3>${step.title}</h3>
      <p>${step.text}</p>
      <div class="tut-actions">
        <button class="btn ghost small" data-act="skip">Saltar tutorial</button>
        ${step.done ? '<span class="tut-hint">Hazlo para continuar ✦</span>' : `<button class="btn primary small" data-act="next">${step.next ?? (last ? 'Terminar' : 'Siguiente')}</button>`}
      </div>`;
    this.bubble.querySelector<HTMLButtonElement>('[data-act="skip"]')!.onclick = () => this.stop(true);
    const next = this.bubble.querySelector<HTMLButtonElement>('[data-act="next"]');
    if (next) next.onclick = () => this.go(i + 1);
    const target = this.targetEl();
    target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    this.bubble.classList.remove('enter');
    void this.bubble.offsetWidth;
    this.bubble.classList.add('enter');
    this.layout();
  }

  private tick(): void {
    const step = this.steps[this.index];
    if (step?.done?.()) this.go(this.index + 1);
    else this.layout();
  }

  private targetEl(): HTMLElement | null {
    const sel = this.steps[this.index]?.target;
    return sel ? document.querySelector<HTMLElement>(sel) : null;
  }

  private place(left: number, top: number): void {
    this.bubble.style.left = `${left}px`;
    this.bubble.style.top = `${top}px`;
  }

  private layout = (): void => {
    if (!this.root) return;
    const target = this.targetEl();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bw = Math.min(360, vw - 24);
    this.bubble.style.width = `${bw}px`;
    const bh = this.bubble.offsetHeight;
    if (!target) {
      this.dim.hidden = false;
      this.spot.hidden = true;
      this.bubble.style.left = `${(vw - bw) / 2}px`;
      this.bubble.style.top = `${Math.max(12, (vh - bh) / 2)}px`;
      return;
    }
    this.dim.hidden = true;
    this.spot.hidden = false;
    const r = target.getBoundingClientRect();
    const pad = 6;
    Object.assign(this.spot.style, {
      left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`,
    });
    const clampTop = (t: number) => Math.max(12, Math.min(vh - bh - 12, t));
    // Elementos altos: el globo va al costado para no tapar lo que hay que usar.
    if (r.height > vh * 0.45) {
      const midTop = clampTop(r.top + Math.min(r.height, vh) / 2 - bh / 2);
      if (vw - r.right > bw + 24) return this.place(r.right + 14, midTop);
      if (r.left > bw + 24) return this.place(r.left - bw - 14, midTop);
    }
    const below = r.bottom + 14;
    const above = r.top - bh - 14;
    const top = below + bh < vh ? below : above > 0 ? above : clampTop(vh - bh);
    this.place(Math.max(12, Math.min(vw - bw - 12, r.left + r.width / 2 - bw / 2)), top);
  };
}
