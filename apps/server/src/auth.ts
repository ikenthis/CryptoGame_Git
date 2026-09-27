import { createHmac, timingSafeEqual } from 'node:crypto';

// Identidad de jugadores. Telegram firma los datos de lanzamiento de la Mini App
// con el token del bot; el servidor comprueba esa firma y emite una sesión
// propia (HMAC) para las siguientes peticiones.

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface Session {
  sub: string;
  name: string;
  exp: number;
}

/**
 * Valida `Telegram.WebApp.initData` según
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * Devuelve el usuario si la firma es correcta y no ha caducado.
 */
export function verifyTelegramInitData(initData: string, botToken: string, now: Date, maxAgeSeconds = 86_400): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !botToken) return null;
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (!safeEqual(hash, expected)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || now.getTime() / 1000 - authDate > maxAgeSeconds) return null;
  try {
    const user = JSON.parse(params.get('user') ?? 'null') as TelegramUser | null;
    return user && Number.isSafeInteger(user.id) ? user : null;
  } catch {
    return null;
  }
}

export function signSession(sub: string, name: string, secret: string, now: Date, ttlSeconds = 7 * 86_400): string {
  const body = Buffer.from(JSON.stringify({ sub, name, exp: Math.floor(now.getTime() / 1000) + ttlSeconds })).toString('base64url');
  return `${body}.${mac(body, secret)}`;
}

export function verifySession(token: string, secret: string, now: Date): Session | null {
  const [body, sig] = token.split('.');
  if (!body || !sig || !secret || !safeEqual(sig, mac(body, secret))) return null;
  try {
    const session = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Session;
    return typeof session.sub === 'string' && session.exp > now.getTime() / 1000 ? session : null;
  } catch {
    return null;
  }
}

function mac(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
