// Ilustraciones generadas (tools/art/generate.ts). El manifest lista las que
// existen; lo que no esté se dibuja con el arte vectorial de siempre.

let manifest: Record<string, string> = {};

export async function loadArt(): Promise<void> {
  try {
    const res = await fetch('art/manifest.json', { cache: 'no-cache' });
    if (res.ok) manifest = await res.json();
  } catch {
    manifest = {};
  }
}

/** URL relativa de una ilustración (p. ej. "cards/meteor") o null si no existe. */
export function artUrl(id: string): string | null {
  return manifest[id] ?? null;
}
