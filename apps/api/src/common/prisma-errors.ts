import { Prisma } from '@prisma/client';

/**
 * Vrai si l'erreur est une violation Postgres de contrainte unique (P2002)
 * remontée par Prisma. Sert de filet de sécurité sous concurrence : entre le
 * pré-check applicatif (findFirst/findUnique) et l'insert/update, une requête
 * concurrente peut avoir créé la même valeur. Ce filet convertit la
 * `PrismaClientKnownRequestError` en erreur métier propre au lieu de la
 * laisser fuiter en 500.
 */
export function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
