import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';
import { loginSchema, type UserDTO } from '@suivi/shared';
import { parseOrThrow } from '../common/api-error';
import { AuthService } from './auth.service';
import { AUTH_COOKIE_NAME, authCookieClearOptions, authCookieOptions } from './cookie';
import { CurrentUser } from './current-user.decorator';
import type { AuthUser } from './jwt.guard';
import { Public } from './public.decorator';

type LoginInput = z.infer<typeof loginSchema>;

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() rawBody: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserDTO }> {
    const body: LoginInput = parseOrThrow(loginSchema, rawBody);
    const user = await this.auth.validateCredentials(body.email, body.password);
    res.cookie(AUTH_COOKIE_NAME, this.auth.signToken(user), authCookieOptions());
    return { user };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(AUTH_COOKIE_NAME, authCookieClearOptions());
  }

  @Get('me')
  async me(@CurrentUser() current: AuthUser): Promise<{ user: UserDTO }> {
    return { user: await this.auth.getUser(current.id) };
  }
}
