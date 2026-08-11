import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ErrorCode } from '@suivi/shared';
import { ApiException } from './api.exception';

/**
 * Corps de réponse d'erreur : `ApiError` du contrat partagé, élargi au seul
 * code technique 'INTERNAL' (aucun ErrorCode du contrat ne couvre l'erreur
 * serveur inattendue ; le front n'y réagit que par un message générique).
 */
export interface ApiErrorBody {
  code: ErrorCode | 'INTERNAL';
  message: string;
  details?: unknown;
}

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'AUTH_REQUIRED',
  404: 'NOT_FOUND',
  409: 'VERSION_CONFLICT',
  422: 'VALIDATION_FAILED',
};

const STATUS_TO_MESSAGE: Record<number, string> = {
  400: 'Requête invalide.',
  401: 'Connexion requise.',
  404: 'Ressource introuvable.',
  409: 'Conflit de version.',
  422: 'Données invalides.',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toApiError(exception);
    response.status(status).json(body);
  }

  private toApiError(exception: unknown): { status: number; body: ApiErrorBody } {
    if (exception instanceof ApiException) {
      const body: ApiErrorBody = { code: exception.code, message: exception.userMessage };
      if (exception.details !== undefined) {
        body.details = exception.details;
      }
      return { status: exception.getStatus(), body };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        body: {
          code: STATUS_TO_CODE[status] ?? 'VALIDATION_FAILED',
          message: STATUS_TO_MESSAGE[status] ?? 'Requête invalide.',
        },
      };
    }

    this.logger.error(
      'Erreur inattendue',
      exception instanceof Error ? exception.stack : String(exception),
    );
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL', message: 'Erreur interne du serveur.' },
    };
  }
}
