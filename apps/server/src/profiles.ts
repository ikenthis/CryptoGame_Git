import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { newProfile, refreshSupplies, type Profile } from '@gentium/engine';

// Perfiles de jugador guardados en el servidor: el servidor es la autoridad sobre
// la colección y los recursos, así nadie puede fabricarse objetos en su navegador.
// Almacén en memoria con volcado a JSON; para miles de jugadores, migrar a Postgres.

export interface StoredPlayer {
  name: string;
  profile: Profile;
  createdAt: number;
}

export class ProfileStore {
  private readonly players = new Map<string, StoredPlayer>();
  private readonly file: string | undefined;

  constructor(file?: string) {
    this.file = file;
    if (file) mkdirSync(dirname(file), { recursive: true });
    if (file && existsSync(file)) {
      for (const [id, p] of Object.entries(JSON.parse(readFileSync(file, 'utf8')) as Record<string, StoredPlayer>)) this.players.set(id, p);
    }
  }

  /** Devuelve el perfil (lo crea la primera vez) con las provisiones al día. */
  get(playerId: string, name: string, now: number): Profile {
    let player = this.players.get(playerId);
    if (!player) {
      player = { name, profile: newProfile(now), createdAt: now };
      this.players.set(playerId, player);
      this.save();
    }
    if (name && player.name !== name) player.name = name;
    return refreshSupplies(player.profile, now);
  }

  name(playerId: string): string {
    return this.players.get(playerId)?.name ?? playerId;
  }

  has(playerId: string): boolean {
    return this.players.has(playerId);
  }

  /** Aplica un cambio al perfil: si la función lanza un error, no se guarda nada. */
  update<T>(playerId: string, name: string, now: number, fn: (p: Profile) => { profile: Profile; value: T }): { profile: Profile; value: T } {
    const current = this.get(playerId, name, now);
    const out = fn(current);
    this.players.get(playerId)!.profile = out.profile;
    this.save();
    return out;
  }

  count(): number {
    return this.players.size;
  }

  private save(): void {
    if (!this.file) return;
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.players)));
    renameSync(tmp, this.file);
  }
}
