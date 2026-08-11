import { HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/api.exception';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const jwt = new JwtService({ secret: 'secret-test' });
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await argon2.hash('motdepasse');
  }, 30000);

  function dbUser() {
    return {
      id: 'u1',
      email: 'test@suivi.local',
      passwordHash,
      displayName: 'Testeur',
      cursorColor: '#FF0000',
      createdAt: new Date(),
    };
  }

  function serviceWith(found: ReturnType<typeof dbUser> | null): {
    service: AuthService;
    findUnique: jest.Mock;
  } {
    const findUnique = jest.fn().mockResolvedValue(found);
    const prisma = { user: { findUnique } } as unknown as PrismaService;
    return { service: new AuthService(prisma, jwt), findUnique };
  }

  it('retourne un UserDTO sans passwordHash quand le mot de passe est bon', async () => {
    const { service } = serviceWith(dbUser());

    await expect(service.validateCredentials('test@suivi.local', 'motdepasse')).resolves.toEqual({
      id: 'u1',
      email: 'test@suivi.local',
      displayName: 'Testeur',
      cursorColor: '#FF0000',
    });
  });

  it("normalise l'e-mail (trim + minuscules) avant la recherche", async () => {
    const { service, findUnique } = serviceWith(dbUser());

    await service.validateCredentials('  Test@Suivi.Local  ', 'motdepasse');

    expect(findUnique).toHaveBeenCalledWith({ where: { email: 'test@suivi.local' } });
  });

  it('rejette AUTH_INVALID (401) quand le mot de passe est faux', async () => {
    const { service } = serviceWith(dbUser());

    await expect(
      service.validateCredentials('test@suivi.local', 'mauvais-mot-de-passe'),
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID',
      userMessage: 'E-mail ou mot de passe incorrect.',
    });
  });

  it("rejette AUTH_INVALID (401) quand l'e-mail est inconnu", async () => {
    const { service } = serviceWith(null);

    const error: ApiException = await service
      .validateCredentials('inconnu@suivi.local', 'motdepasse')
      .then(
        () => {
          throw new Error('aurait dû échouer');
        },
        (e: ApiException) => e,
      );

    expect(error.code).toBe('AUTH_INVALID');
    expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('getUser rejette AUTH_REQUIRED quand le compte a disparu', async () => {
    const { service } = serviceWith(null);

    await expect(service.getUser('u1')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('signToken produit un JWT dont le payload est { sub, email }', () => {
    const { service } = serviceWith(dbUser());

    const token = service.signToken({
      id: 'u1',
      email: 'test@suivi.local',
      displayName: 'Testeur',
      cursorColor: '#FF0000',
    });

    expect(jwt.verify<{ sub: string; email: string }>(token)).toMatchObject({
      sub: 'u1',
      email: 'test@suivi.local',
    });
  });
});
