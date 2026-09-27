import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  canonicalArmy, computePayouts, runTournament, type Army, type PayoutPlan, type Standing,
} from '@bastion/engine';

export interface Entry {
  playerId: string;
  army: Army;
  submittedAt: string;
  salt: string;
  /** sha256(torneo|jugador|ejército canónico|sal). Es lo que se registra on-chain. */
  commitment: string;
}

export interface TournamentResult {
  closedAt: string;
  pool: number;
  standings: Standing[];
  plan: PayoutPlan;
}

export interface Tournament {
  id: string;
  name: string;
  closesAt: string;
  /** Importes en unidades mínimas del token (1 USDC = 1_000_000). */
  entryFee: number;
  sponsorPool: number;
  feeBps: number;
  /**
   * 'open': todas las cartas disponibles para todos (por defecto; el premio no se
   * puede comprar). 'owned': solo cartas que el jugador posee (requiere verificar inventario).
   */
  cardPool: 'open' | 'owned';
  entries: Entry[];
  result: TournamentResult | null;
}

export class StoreError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function commitmentFor(tournamentId: string, playerId: string, army: Army, salt: string): string {
  return createHash('sha256').update(`${tournamentId}|${playerId}|${canonicalArmy(army)}|${salt}`).digest('hex');
}

export function poolOf(t: Tournament): number {
  return t.sponsorPool + t.entryFee * t.entries.length;
}

/** Almacén en memoria con volcado opcional a JSON. En producción: Postgres. */
export class TournamentStore {
  private readonly tournaments = new Map<string, Tournament>();
  private readonly dataFile: string | undefined;

  constructor(dataFile?: string) {
    this.dataFile = dataFile;
    if (dataFile) mkdirSync(dirname(dataFile), { recursive: true });
    if (dataFile && existsSync(dataFile)) {
      for (const t of JSON.parse(readFileSync(dataFile, 'utf8')) as Tournament[]) this.tournaments.set(t.id, t);
    }
  }

  list(): Tournament[] {
    return [...this.tournaments.values()].sort((a, b) => a.closesAt.localeCompare(b.closesAt));
  }

  get(id: string): Tournament {
    const t = this.tournaments.get(id);
    if (!t) throw new StoreError(404, 'Torneo no encontrado.');
    return t;
  }

  has(id: string): boolean {
    return this.tournaments.has(id);
  }

  create(t: Omit<Tournament, 'entries' | 'result'>): Tournament {
    if (this.tournaments.has(t.id)) throw new StoreError(409, 'Ya existe un torneo con ese id.');
    const created: Tournament = { ...t, entries: [], result: null };
    this.tournaments.set(t.id, created);
    this.save();
    return created;
  }

  /** Inscribe o reemplaza el ejército de un jugador. Reemplazar lo manda al final (desempate por orden). */
  enter(id: string, playerId: string, army: Army, now: Date, salt = randomBytes(16).toString('hex')): Entry {
    const t = this.get(id);
    if (t.result || now >= new Date(t.closesAt)) throw new StoreError(409, 'El torneo ya está cerrado.');
    const entry: Entry = {
      playerId, army, salt, submittedAt: now.toISOString(), commitment: commitmentFor(id, playerId, army, salt),
    };
    t.entries = t.entries.filter((e) => e.playerId !== playerId);
    t.entries.push(entry);
    this.save();
    return entry;
  }

  close(id: string, now: Date): Tournament {
    const t = this.get(id);
    if (t.result) throw new StoreError(409, 'El torneo ya está cerrado.');
    const { standings } = runTournament(t.entries.map((e) => ({ id: e.playerId, army: e.army })));
    const pool = poolOf(t);
    t.result = { closedAt: now.toISOString(), pool, standings, plan: computePayouts(pool, t.feeBps, standings) };
    this.save();
    return t;
  }

  /** Cierra los torneos cuyo plazo venció. Devuelve los ids cerrados. */
  closeDue(now: Date): string[] {
    const due = this.list().filter((t) => !t.result && now >= new Date(t.closesAt));
    for (const t of due) this.close(t.id, now);
    return due.map((t) => t.id);
  }

  private save(): void {
    if (!this.dataFile) return;
    const tmp = `${this.dataFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.list()));
    renameSync(tmp, this.dataFile);
  }
}
