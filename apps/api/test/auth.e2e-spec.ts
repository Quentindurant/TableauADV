import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.rowEvent.deleteMany();
    await prisma.user.deleteMany();
    await prisma.user.create({
      data: {
        email: 'test@suivi.local',
        passwordHash: await argon2.hash('motdepasse'),
        displayName: 'Testeur',
        cursorColor: '#FF0000',
      },
    });
  }, 30000);

  async function login(): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test@suivi.local', password: 'motdepasse' })
      .expect(200);
    return res.get('Set-Cookie') as unknown as string[];
  }

  it('POST /api/auth/login : identifiants valides → 200 + cookie httpOnly token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test@suivi.local', password: 'motdepasse' })
      .expect(200);

    expect(res.body.user).toMatchObject({
      email: 'test@suivi.local',
      displayName: 'Testeur',
      cursorColor: '#FF0000',
    });
    expect(res.body.user.passwordHash).toBeUndefined();

    const cookies = res.get('Set-Cookie') as unknown as string[];
    const token = cookies.find((c) => c.startsWith('token='));
    expect(token).toBeDefined();
    expect(token).toContain('HttpOnly');
    expect(token).toContain('SameSite=Lax');
    expect(token).toContain('Max-Age=2592000');
    expect(token).not.toContain('Secure');
  });

  it("POST /api/auth/login : e-mail en majuscules → accepté (normalisation)", async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'TEST@Suivi.Local', password: 'motdepasse' })
      .expect(200);
  });

  it('POST /api/auth/login : mauvais mot de passe → 401 AUTH_INVALID', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test@suivi.local', password: 'mauvais-mot-de-passe' })
      .expect(401);

    expect(res.body).toEqual({
      code: 'AUTH_INVALID',
      message: 'E-mail ou mot de passe incorrect.',
    });
    expect(res.get('Set-Cookie')).toBeUndefined();
  });

  it('POST /api/auth/login : e-mail inconnu → 401 AUTH_INVALID', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'inconnu@suivi.local', password: 'motdepasse' })
      .expect(401);

    expect(res.body.code).toBe('AUTH_INVALID');
  });

  it('POST /api/auth/login : corps invalide → 422 VALIDATION_FAILED avec details', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'pas-un-email', password: '' })
      .expect(422);

    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.message).toBe('Données invalides.');
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  it('GET /api/auth/me : sans cookie → 401 AUTH_REQUIRED', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/me').expect(401);

    expect(res.body).toEqual({ code: 'AUTH_REQUIRED', message: 'Connexion requise.' });
  });

  it('GET /api/auth/me : cookie invalide → 401 AUTH_REQUIRED', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', ['token=nimporte.quoi.ici'])
      .expect(401);

    expect(res.body.code).toBe('AUTH_REQUIRED');
  });

  it("GET /api/auth/me : avec cookie → 200 et l'utilisateur courant", async () => {
    const cookie = await login();

    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body.user).toMatchObject({
      email: 'test@suivi.local',
      displayName: 'Testeur',
    });
  });

  it('POST /api/auth/logout : 204 et efface le cookie', async () => {
    const cookie = await login();

    const res = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .expect(204);

    const cookies = res.get('Set-Cookie') as unknown as string[];
    expect(cookies.some((c) => c.startsWith('token=;'))).toBe(true);
  });

  it('POST /api/auth/logout : réussit aussi sans cookie (route publique)', async () => {
    await request(app.getHttpServer()).post('/api/auth/logout').expect(204);
  });

  it('GET /api/health reste accessible sans cookie (@Public)', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(res.body).toEqual({ status: 'ok' });
  });

  it('une route protégée inconnue renvoie bien le format ApiError', async () => {
    const res = await request(app.getHttpServer()).get('/api/inexistant').expect(404);

    expect(res.body).toEqual({ code: 'NOT_FOUND', message: 'Ressource introuvable.' });
  });
});
