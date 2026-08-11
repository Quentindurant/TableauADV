import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { currentUserFactory } from './current-user.decorator';
import { AUTH_COOKIE_NAME, authCookieOptions } from './cookie';
import { JwtAuthGuard, type AuthenticatedRequest } from './jwt.guard';

const jwt = new JwtService({ secret: 'secret-test' });

function contextFor(
  cookies: Record<string, string | undefined>,
  type: 'http' | 'ws' = 'http',
): { context: ExecutionContext; request: AuthenticatedRequest } {
  const request = { cookies } as unknown as AuthenticatedRequest;
  const context = {
    getType: () => type,
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

function guardWith(isPublic: boolean): JwtAuthGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(isPublic),
  } as unknown as Reflector;
  return new JwtAuthGuard(reflector, jwt);
}

describe('JwtAuthGuard', () => {
  it('refuse AUTH_REQUIRED quand le cookie token est absent', () => {
    const { context } = contextFor({});

    expect(() => guardWith(false).canActivate(context)).toThrow(
      expect.objectContaining({ code: 'AUTH_REQUIRED' }) as unknown as Error,
    );
  });

  it('refuse AUTH_REQUIRED quand le cookie token est invalide', () => {
    const { context } = contextFor({ [AUTH_COOKIE_NAME]: 'nimporte.quoi.ici' });

    expect(() => guardWith(false).canActivate(context)).toThrow(
      expect.objectContaining({ code: 'AUTH_REQUIRED' }) as unknown as Error,
    );
  });

  it('refuse AUTH_REQUIRED quand le token est signé avec un autre secret', () => {
    const autre = new JwtService({ secret: 'autre-secret' }).sign({
      sub: 'u1',
      email: 'test@suivi.local',
    });
    const { context } = contextFor({ [AUTH_COOKIE_NAME]: autre });

    expect(() => guardWith(false).canActivate(context)).toThrow(
      expect.objectContaining({ code: 'AUTH_REQUIRED' }) as unknown as Error,
    );
  });

  it('accepte un token valide et pose req.user = { id, email }', () => {
    const token = jwt.sign({ sub: 'u1', email: 'test@suivi.local' });
    const { context, request } = contextFor({ [AUTH_COOKIE_NAME]: token });

    expect(guardWith(false).canActivate(context)).toBe(true);
    expect(request.user).toEqual({ id: 'u1', email: 'test@suivi.local' });
  });

  it('laisse passer une route marquée @Public() sans cookie', () => {
    const { context } = contextFor({});

    expect(guardWith(true).canActivate(context)).toBe(true);
  });

  it("laisse passer les contextes non HTTP (les sockets s'authentifient en Feature 5)", () => {
    const { context } = contextFor({}, 'ws');

    expect(guardWith(false).canActivate(context)).toBe(true);
  });
});

describe('cookie', () => {
  it('produit un cookie httpOnly, sameSite lax, 30 jours, non secure hors production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    expect(authCookieOptions()).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    process.env.NODE_ENV = previous;
  });

  it('produit un cookie secure en production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    expect(authCookieOptions().secure).toBe(true);

    process.env.NODE_ENV = previous;
  });
});

describe('currentUserFactory', () => {
  it("retourne l'utilisateur posé par la garde", () => {
    const { context, request } = contextFor({});
    request.user = { id: 'u1', email: 'test@suivi.local' };

    expect(currentUserFactory(undefined, context)).toEqual({
      id: 'u1',
      email: 'test@suivi.local',
    });
  });

  it('lève AUTH_REQUIRED si aucune garde n\'a posé req.user', () => {
    const { context } = contextFor({});

    expect(() => currentUserFactory(undefined, context)).toThrow(
      expect.objectContaining({ code: 'AUTH_REQUIRED' }) as unknown as Error,
    );
  });
});
