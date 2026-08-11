import {
  type ArgumentsHost,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiException, validationFailed } from './api.exception';
import { ApiExceptionFilter, type ApiErrorBody } from './api-exception.filter';

function createHost(): {
  host: ArgumentsHost;
  status: jest.Mock;
  json: jest.Mock;
} {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('ApiExceptionFilter', () => {
  const filter = new ApiExceptionFilter();

  it('formate une ApiException avec son code, son message et ses details', () => {
    const { host, status, json } = createHost();

    filter.catch(
      new ApiException('VERSION_CONFLICT', 'Modifié entre-temps.', HttpStatus.CONFLICT, {
        conflictKeys: ['statut'],
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith<[ApiErrorBody]>({
      code: 'VERSION_CONFLICT',
      message: 'Modifié entre-temps.',
      details: { conflictKeys: ['statut'] },
    });
  });

  it('formate la fabrique validationFailed en 422 VALIDATION_FAILED', () => {
    const { host, status, json } = createHost();

    filter.catch(validationFailed('Données invalides.', [{ path: 'email', message: 'X' }]), host);

    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith({
      code: 'VALIDATION_FAILED',
      message: 'Données invalides.',
      details: [{ path: 'email', message: 'X' }],
    });
  });

  it('traduit une NotFoundException de Nest en 404 NOT_FOUND', () => {
    const { host, status, json } = createHost();

    filter.catch(new NotFoundException(), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      code: 'NOT_FOUND',
      message: 'Ressource introuvable.',
    });
  });

  it('traduit une UnauthorizedException de Nest en 401 AUTH_REQUIRED', () => {
    const { host, status, json } = createHost();

    filter.catch(new UnauthorizedException(), host);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      code: 'AUTH_REQUIRED',
      message: 'Connexion requise.',
    });
  });

  it('traduit un statut HTTP non cartographié en 4xx VALIDATION_FAILED', () => {
    const { host, status, json } = createHost();

    filter.catch(new ForbiddenException(), host);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      code: 'VALIDATION_FAILED',
      message: 'Requête invalide.',
    });
  });

  it('traduit une erreur inattendue en 500 INTERNAL sans fuiter le détail', () => {
    const { host, status, json } = createHost();

    filter.catch(new Error('connexion Postgres perdue'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      code: 'INTERNAL',
      message: 'Erreur interne du serveur.',
    });
  });
});
