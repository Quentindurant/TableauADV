import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../../src/app.module';
import { setupApp } from '../../src/app.setup';
import { PrismaService } from '../../src/prisma/prisma.service';
import { seed } from '../../prisma/seed';

const TEST_EMAIL = 'config.e2e@test.fr';
const TEST_PASSWORD = 'motdepasse-test';

export interface ConfigTestContext {
  app: INestApplication;
  prisma: PrismaService;
  cookie: string;
}

/**
 * Démarre l'application complète (même configuration HTTP que la prod via setupApp),
 * crée un utilisateur de test et récupère le cookie JWT `token` par un vrai login.
 */
export async function createConfigTestContext(): Promise<ConfigTestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = setupApp(moduleRef.createNestApplication());
  await app.init();

  const prisma = app.get(PrismaService);
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      passwordHash: await argon2.hash(TEST_PASSWORD),
      displayName: 'Testeur configuration',
      cursorColor: '#3498DB',
    },
  });

  const login = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

  if (login.status !== 200) {
    throw new Error(
      `Login de test impossible (statut ${login.status}) — vérifier POST /api/auth/login (Feature 2).`,
    );
  }

  const rawCookies = login.headers['set-cookie'] as unknown as string[];
  const cookie = rawCookies.map((value) => value.split(';')[0]).join('; ');

  return { app, prisma, cookie };
}

/** Vide les tables de configuration et les lignes (isolation entre tests). */
export async function resetConfigTables(prisma: PrismaService): Promise<void> {
  await prisma.row.deleteMany();
  await prisma.choice.deleteMany();
  await prisma.column.deleteMany();
}

/** Restaure la base de données au état seedé (16 colonnes + choix). */
export async function reseedConfigTables(prisma: PrismaService): Promise<void> {
  await seed(prisma);
}

/**
 * Ferme l'application et supprime l'utilisateur de test.
 * Ne vide PAS les tables de configuration : le reseed éventuel est à la charge
 * de l'appelant AVANT cet appel (ex. reseedConfigTables dans afterAll).
 */
export async function closeConfigTestContext(ctx: ConfigTestContext): Promise<void> {
  await ctx.prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await ctx.app.close();
}
