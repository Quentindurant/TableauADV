import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { createUserSchema, updateMeSchema, type UserDTO } from '@suivi/shared';
import { parseOrThrow } from '../common/api-error';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt.guard';
import {
  UsersService,
  type CreateUserInput,
  type UpdateMeInput,
} from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<UserDTO[]> {
    return this.users.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() rawBody: unknown): Promise<UserDTO> {
    const body: CreateUserInput = parseOrThrow(createUserSchema, rawBody);
    return this.users.create(body);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() current: AuthUser,
    @Body() rawBody: unknown,
  ): Promise<UserDTO> {
    const body: UpdateMeInput = parseOrThrow(updateMeSchema, rawBody);
    return this.users.updateMe(current.id, body);
  }
}
