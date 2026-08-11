import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import type { z } from 'zod';
import { createUserSchema, updateMeSchema, type UserDTO } from '@suivi/shared';
import { validationFailed } from '../common/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail, toUserDTO } from './user.mapper';

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

const EMAIL_DEJA_UTILISE = 'Cette adresse e-mail est déjà utilisée.';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<UserDTO[]> {
    const users = await this.prisma.user.findMany({ orderBy: { displayName: 'asc' } });
    return users.map(toUserDTO);
  }

  async create(input: CreateUserInput): Promise<UserDTO> {
    const email = normalizeEmail(input.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw validationFailed(EMAIL_DEJA_UTILISE, [
        { path: 'email', message: EMAIL_DEJA_UTILISE },
      ]);
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          displayName: input.displayName,
          cursorColor: input.cursorColor,
          passwordHash: await argon2.hash(input.password),
        },
      });
      return toUserDTO(user);
    } catch (error) {
      // Course entre deux créations simultanées : contrainte unique Postgres.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw validationFailed(EMAIL_DEJA_UTILISE, [
          { path: 'email', message: EMAIL_DEJA_UTILISE },
        ]);
      }
      throw error;
    }
  }

  async updateMe(id: string, input: UpdateMeInput): Promise<UserDTO> {
    const data: Prisma.UserUpdateInput = {};
    if (input.displayName !== undefined) {
      data.displayName = input.displayName;
    }
    if (input.cursorColor !== undefined) {
      data.cursorColor = input.cursorColor;
    }
    if (input.password !== undefined) {
      data.passwordHash = await argon2.hash(input.password);
    }
    const user = await this.prisma.user.update({ where: { id }, data });
    return toUserDTO(user);
  }
}
