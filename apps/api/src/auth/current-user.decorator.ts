import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
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
