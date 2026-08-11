import type { CookieOptions } from 'express';

/** Nom du cookie JWT httpOnly (contrat partagé) — lu aussi par le middleware Next. */
export const AUTH_COOKIE_NAME = 'token';

/** 30 jours, en millisecondes (unité attendue par express `res.cookie`). */
export const AUTH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

export function authCookieOptions(): CookieOptions {
  return { ...baseOptions(), maxAge: AUTH_COOKIE_MAX_AGE_MS };
}

/** Mêmes attributs SANS maxAge : express `clearCookie` pose sa propre expiration. */
export function authCookieClearOptions(): CookieOptions {
  return baseOptions();
}
