/**
 * Authentification des sockets (Feature 5).
 *
 * Le handshake Socket.IO ne passe pas par le middleware `cookie-parser` de
 * l'application HTTP : on lit donc l'en-tete `Cookie` brut du handshake et on
 * en extrait le cookie httpOnly `token` pose par `POST /api/auth/login`.
 */

/** Nom du cookie JWT httpOnly, identique au contrat REST. */
export const AUTH_COOKIE_NAME = 'token';

/** Payload minimal du JWT emis par la Feature 2. */
export interface WsJwtPayload {
  sub: string;
}

/** Partie du handshake Socket.IO dont on a besoin (facilite les tests). */
export interface WsHandshakeLike {
  headers: { cookie?: string };
}

/**
 * Parse un en-tete `Cookie` HTTP en dictionnaire nom -> valeur.
 * Premier cookie gagnant en cas de doublon ; valeur rendue telle quelle si
 * `decodeURIComponent` echoue (cookie non encode).
 */
export function parseCookieHeader(
  header: string | undefined | null,
): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) {
    return cookies;
  }
  for (const fragment of header.split(';')) {
    const raw = fragment.trim();
    if (raw.length === 0) {
      continue;
    }
    const separator = raw.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const name = raw.slice(0, separator).trim();
    const value = raw.slice(separator + 1).trim();
    if (Object.prototype.hasOwnProperty.call(cookies, name)) {
      continue;
    }
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

/** Extrait le JWT du handshake, ou `null` si absent. */
export function tokenFromHandshake(handshake: WsHandshakeLike): string | null {
  const token: string | undefined = parseCookieHeader(handshake.headers.cookie)[
    AUTH_COOKIE_NAME
  ];
  return token !== undefined && token.length > 0 ? token : null;
}
