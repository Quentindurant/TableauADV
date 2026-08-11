import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '@suivi/shared';

/**
 * Exception métier de l'API. Toute erreur volontairement renvoyée au client
 * passe par cette classe : le filtre global (api-exception.filter.ts) la
 * sérialise en `ApiError { code, message, details }` (contrat partagé).
 *
 * `userMessage` duplique volontairement le message : il est la source de
 * vérité du filtre, indépendamment de la façon dont Nest dérive
 * `HttpException.message` du corps de réponse.
 */
export class ApiException extends HttpException {
  readonly code: ErrorCode;
  readonly userMessage: string;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status: HttpStatus, details?: unknown) {
    super({ code, message, details }, status);
    this.code = code;
    this.userMessage = message;
    this.details = details;
  }
}

export function authInvalid(): ApiException {
  return new ApiException(
    'AUTH_INVALID',
    'E-mail ou mot de passe incorrect.',
    HttpStatus.UNAUTHORIZED,
  );
}

export function authRequired(message = 'Connexion requise.'): ApiException {
  return new ApiException('AUTH_REQUIRED', message, HttpStatus.UNAUTHORIZED);
}

export function validationFailed(message: string, details?: unknown): ApiException {
  return new ApiException(
    'VALIDATION_FAILED',
    message,
    HttpStatus.UNPROCESSABLE_ENTITY,
    details,
  );
}

export function notFound(message = 'Ressource introuvable.'): ApiException {
  return new ApiException('NOT_FOUND', message, HttpStatus.NOT_FOUND);
}
