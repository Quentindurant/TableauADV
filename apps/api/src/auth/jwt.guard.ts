import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { authRequired } from '../common/api.exception';
import { AUTH_COOKIE_NAME } from './cookie';
import { IS_PUBLIC_KEY } from './public.decorator';

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

interface JwtPayload {
  sub: string;
  email: string;
}

/**
 * Garde globale (APP_GUARD) : lit le cookie httpOnly `token`, vérifie le JWT
 * et pose `req.user`. Les routes marquées `@Public()` sont laissées passer.
 * Les contextes non HTTP (WebSocket) sont ignorés : le handshake Socket.IO
 * est authentifié par `ws-jwt` en Feature 5.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const token = cookies?.[AUTH_COOKIE_NAME];
    if (!token) {
      throw authRequired();
    }

    try {
      const payload = this.jwt.verify<JwtPayload>(token);
      request.user = { id: payload.sub, email: payload.email };
      return true;
    } catch {
      throw authRequired('Session expirée, reconnectez-vous.');
    }
  }
}
