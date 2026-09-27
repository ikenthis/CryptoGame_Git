import { mulberry32, newProfile, refreshSupplies, type Profile } from '@gentium/engine';

// Perfil del jugador (colección, recursos y progreso de campaña). En la demo sin
// servidor se guarda en el navegador; con sesión, el servidor es la autoridad y
// aquí solo se guarda la última copia recibida (ver state/backend.ts).

const KEY = 'gentium.profile';
const listeners = new Set<(p: Profile) => void>();
let profile: Profile = load();
/** false cuando el perfil viene del servidor: la copia local de la demo no se toca. */
let persist = true;

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Profile;
      if (p?.version === 1) return refreshSupplies(p, Date.now());
    }
  } catch { /* almacenamiento no disponible o dañado */ }
  return newProfile(Date.now());
}

function save(): void {
  if (!persist) return;
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* opcional */ }
}

export function getProfile(): Profile {
  return profile;
}

export function setProfile(next: Profile): void {
  profile = next;
  save();
  for (const fn of listeners) fn(profile);
}

/** Pasa a usar el perfil del servidor (no se guarda en el navegador). */
export function useServerProfile(next: Profile): void {
  persist = false;
  setProfile(next);
}

export function onProfile(fn: (p: Profile) => void): void {
  listeners.add(fn);
}

/** Azar del navegador para abrir sobres (en el servidor se usará su propia semilla). */
export function rng(): () => number {
  const seed = new Uint32Array(1);
  crypto.getRandomValues(seed);
  return mulberry32(seed[0]);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Las provisiones se recuperan con el tiempo aunque la página siga abierta.
setInterval(() => {
  const next = refreshSupplies(profile, Date.now());
  if (next.resources.supplies !== profile.resources.supplies) setProfile(next);
}, 30_000);
