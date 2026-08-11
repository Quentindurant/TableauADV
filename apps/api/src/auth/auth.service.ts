import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { UserDTO } from '@suivi/shared';
import { authInvalid, authRequired } from '../common/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail, toUserDTO } from '../users/user.mapper';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async validateCredentials(email: string, password: string): Promise<UserDTO> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
    });
    if (!user) {
      throw authInvalid();
    }
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) {
      throw authInvalid();
    }
    return toUserDTO(user);
  }

  async getUser(id: string): Promise<UserDTO> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      // Le JWT est valide mais le compte a été supprimé entre-temps.
      throw authRequired('Session expirée, reconnectez-vous.');
    }
    return toUserDTO(user);
  }

  signToken(user: UserDTO): string {
    return this.jwt.sign({ sub: user.id, email: user.email });
  }
}
