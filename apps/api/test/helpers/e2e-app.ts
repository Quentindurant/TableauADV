import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { setupApp } from '../../src/app.setup';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
}

/**
 * Helper e2e dédié aux tests de lignes (rows), distinct de config-test-app.ts :
 * ce dernier utilise `app.init()` + un unique utilisateur fixe partagé (adapté
 * aux suites columns/choices), alors que les tests de lignes ont besoin d'un
 * vrai port HTTP (`listen(0)`) pour envoyer des requêtes concurrentes (PATCH,
 * Task 4.5) — supertest ne peut pas fiabiliser des appels concurrents sur un
 * serveur non-écoutant.
 */

/**
 * Démarre l'application de test avec EXACTEMENT la configuration de main.ts.
 * `listen(0)` (et non `init()`) : le serveur HTTP écoute sur un port libre
 * avant les tests, ce qui permet d'envoyer plusieurs requêtes supertest en
 * parallèle (test de PATCH concurrents de la Task 4.5).
 */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = setupApp(moduleRef.createNestApplication());
  await app.listen(0);
  return { app, prisma: app.get(PrismaService) };
}

/**
 * Vide uniquement les tables nécessaires aux tests de lignes (row, rowEvent,
 * user de test). Ne touche PAS `column`/`choice` : les lignes n'ont aucune FK
 * vers ces tables de config, et les vider fragiliserait les suites voisines
 * (columns/choices) sans aucun bénéfice pour ces tests — donc pas de reseed requis.
 */
export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.rowEvent.deleteMany();
  await prisma.row.deleteMany();
  await prisma.user.deleteMany();
}

/** Crée un membre et retourne son id + le cookie JWT httpOnly de session. */
export async function seedUserAndLogin(
  ctx: TestContext,
  email = 'test@suivi.local',
): Promise<{ userId: string; cookie: string[] }> {
  const user = await ctx.prisma.user.create({
    data: {
      email,
      passwordHash: await argon2.hash('motdepasse'),
      displayName: 'Testeur',
      cursorColor: '#FF0000',
    },
  });
  const login = await request(ctx.app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password: 'motdepasse' })
    .expect(200);
  return { userId: user.id, cookie: login.get('Set-Cookie') as unknown as string[] };
}
