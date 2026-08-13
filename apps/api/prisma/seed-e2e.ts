import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * Deux comptes stables pour les tests Playwright de co-édition.
 * Idempotent : rejouable autant de fois que nécessaire.
 */
const USERS = [
  {
    email: 'alice.e2e@test.fr',
    displayName: 'Alice Martin',
    cursorColor: '#E74C3C',
  },
  {
    email: 'bob.e2e@test.fr',
    displayName: 'Bob Dupont',
    cursorColor: '#27AE60',
  },
];

export const E2E_PASSWORD = 'motdepasse-e2e';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const passwordHash = await argon2.hash(E2E_PASSWORD);
    for (const user of USERS) {
      await prisma.user.upsert({
        where: { email: user.email },
        update: { displayName: user.displayName, cursorColor: user.cursorColor, passwordHash },
        create: { ...user, passwordHash },
      });
      console.log(`utilisateur e2e prêt : ${user.email}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Échec du seed e2e :', error);
    process.exit(1);
  });
}
