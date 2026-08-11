import type { ZodType } from 'zod';
import { validationFailed } from './api.exception';

export interface ValidationDetail {
  path: string;
  message: string;
}

/**
 * Validation zod — mécanisme unique de l'API (aucun pipe de validation).
 * Usage : `const body = parseOrThrow(createUserSchema, rawBody);`
 * Toute entrée invalide devient une 422 `VALIDATION_FAILED` dont `details`
 * liste les champs fautifs (messages français portés par les schémas partagés).
 */
export function parseOrThrow<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const details: ValidationDetail[] = result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
  throw validationFailed('Données invalides.', details);
}
