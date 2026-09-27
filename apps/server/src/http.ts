import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { validateArmy, type Army } from '@gentium/engine';
import { StoreError } from './store.ts';

// Utilidades HTTP compartidas por todas las rutas.

export type Handler = (req: IncomingMessage, params: string[], url: URL) => Promise<unknown>;
export type Route = [method: string, pattern: RegExp, handler: Handler];

const MAX_BODY_BYTES = 16 * 1024;

/** Respuesta que no es JSON (p. ej. CSV). */
export class Raw {
  readonly body: string;
  readonly type: string;
  constructor(body: string, type: string) {
    this.body = body;
    this.type = type;
  }
}

export function fail(status: number, message: string): never {
  throw new StoreError(status, message);
}

export async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) fail(413, 'Cuerpo demasiado grande.');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    fail(400, 'JSON inválido.');
  }
}

export function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function requireArmy(input: unknown): Army {
  const check = validateArmy(input);
  if (!check.ok) fail(400, check.error);
  return check.army;
}

export function requireAdmin(req: IncomingMessage, token: string): void {
  const given = Buffer.from(String(req.headers.authorization ?? ''));
  const expected = Buffer.from(`Bearer ${token}`);
  if (!token || given.length !== expected.length || !timingSafeEqual(given, expected)) fail(401, 'No autorizado.');
}

export function nonNegativeInt(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(400, `${field} debe ser un entero no negativo.`);
  return value as number;
}

/** Límite de peticiones por IP (ventana fija de 1 minuto), para frenar abusos y bots. */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; reset: number }>();
  private readonly limit: number;
  constructor(limit: number) {
    this.limit = limit;
  }

  allow(key: string, now: number): boolean {
    const entry = this.hits.get(key);
    if (!entry || now >= entry.reset) {
      this.hits.set(key, { count: 1, reset: now + 60_000 });
      if (this.hits.size > 50_000) this.prune(now);
      return true;
    }
    entry.count++;
    return entry.count <= this.limit;
  }

  private prune(now: number): void {
    for (const [k, v] of this.hits) if (now >= v.reset) this.hits.delete(k);
  }
}

export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  const forwarded = trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '';
  return forwarded || req.socket.remoteAddress || 'desconocida';
}
