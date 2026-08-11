import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { authRequired } from '../common/api.exception';
import type { AuthUser, AuthenticatedRequest } from './jwt.guard';

/** Factory exportée à part pour être testable unitairement. */
export function currentUserFactory(_data: unknown, context: ExecutionContext): AuthUser {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.user) {
    throw authRequired();
  }
  return request.user;
}

/** Usage : `me(@CurrentUser() user: AuthUser)`. */
export const CurrentUser = createParamDecorator(currentUserFactory);

interface RequestWithUser {
  user?: { id?: string; sub?: string };
}

/**
 * Id de l'utilisateur connecté, posé sur la requête par JwtAuthGuard.
 * Accepte les deux formes possibles du payload JWT (`id` ou `sub`).
 */
export const CurrentUserId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<RequestWithUser>();
  const userId = request.user?.id ?? request.user?.sub;
  if (userId === undefined) {
    throw new UnauthorizedException({
      code: 'AUTH_REQUIRED',
      message: 'Authentification requise.',
    });
  }
  return userId;
});
