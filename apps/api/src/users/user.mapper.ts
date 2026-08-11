import type { User } from '@prisma/client';
import type { UserDTO } from '@suivi/shared';

/** Projection User (Prisma) → UserDTO (contrat) : le hash ne sort JAMAIS de l'API. */
export function toUserDTO(user: User): UserDTO {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    cursorColor: user.cursorColor,
  };
}

/** Les e-mails sont stockés et comparés en minuscules, sans espaces. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
