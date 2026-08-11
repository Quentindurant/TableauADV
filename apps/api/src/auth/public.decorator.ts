import { type CustomDecorator, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marque une route comme accessible sans cookie JWT, malgré la garde globale
 * `JwtAuthGuard` (APP_GUARD). Utilisé par `POST /api/auth/login`,
 * `POST /api/auth/logout` et `GET /api/health` uniquement.
 */
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);
