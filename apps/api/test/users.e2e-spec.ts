import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string[];

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
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test@suivi.local', password: 'motdepasse' })
      .expect(200);
    cookie = res.get('Set-Cookie') as unknown as string[];
  }, 30000);

  it('GET /api/users : sans cookie → 401 AUTH_REQUIRED', async () => {
    const res = await request(app.getHttpServer()).get('/api/users').expect(401);

    expect(res.body.code).toBe('AUTH_REQUIRED');
  });

  it('GET /api/users : liste les membres triés par nom, sans hash', async () => {
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Cookie', cookie)
      .send({
        email: 'aline@suivi.local',
        displayName: 'Aline',
        password: 'motdepasse',
        cursorColor: '#2ECC71',
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/users')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body.map((u: { displayName: string }) => u.displayName)).toEqual([
      'Aline',
      'Testeur',
    ]);
    expect(Object.keys(res.body[0]).sort()).toEqual([
      'cursorColor',
      'displayName',
      'email',
      'id',
    ]);
  });

  it('POST /api/users : crée un membre, e-mail normalisé et mot de passe hashé', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/users')
      .set('Cookie', cookie)
      .send({
        email: '  Pierre@Suivi.Local ',
        displayName: 'Pierre',
        password: 'motdepasse',
        cursorColor: '#8E44AD',
      })
      .expect(201);

    expect(res.body).toMatchObject({
      email: 'pierre@suivi.local',
      displayName: 'Pierre',
      cursorColor: '#8E44AD',
    });

    const created = await prisma.user.findUniqueOrThrow({
      where: { email: 'pierre@suivi.local' },
    });
    expect(created.passwordHash).not.toBe('motdepasse');
    await expect(argon2.verify(created.passwordHash, 'motdepasse')).resolves.toBe(true);
  });

  it('POST /api/users : le nouveau membre peut se connecter', async () => {
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Cookie', cookie)
      .send({
        email: 'pierre@suivi.local',
        displayName: 'Pierre',
        password: 'motdepasse',
        cursorColor: '#8E44AD',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'pierre@suivi.local', password: 'motdepasse' })
      .expect(200);
  });

  it('POST /api/users : e-mail déjà utilisé → 422 VALIDATION_FAILED', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/users')
      .set('Cookie', cookie)
      .send({
        email: 'TEST@suivi.local',
        displayName: 'Doublon',
        password: 'motdepasse',
        cursorColor: '#8E44AD',
      })
      .expect(422);

    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Cette adresse e-mail est déjà utilisée.',
      details: [{ path: 'email', message: 'Cette adresse e-mail est déjà utilisée.' }],
    });
  });

  it('POST /api/users : corps invalide → 422 VALIDATION_FAILED', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/users')
      .set('Cookie', cookie)
      .send({
        email: 'nouveau@suivi.local',
        displayName: 'Nouveau',
        password: 'court',
        cursorColor: 'rouge',
      })
      .expect(422);

    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        { path: 'password', message: 'Mot de passe : 8 caractères minimum' },
      ]),
    );
  });

  it('PATCH /api/users/me : modifie nom et couleur de curseur', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .send({ displayName: 'Quentin D.', cursorColor: '#3498DB' })
      .expect(200);

    expect(res.body).toMatchObject({ displayName: 'Quentin D.', cursorColor: '#3498DB' });
  });

  it('PATCH /api/users/me : change le mot de passe (nouvelle connexion possible)', async () => {
    await request(app.getHttpServer())
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .send({ password: 'nouveaumotdepasse' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test@suivi.local', password: 'nouveaumotdepasse' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test@suivi.local', password: 'motdepasse' })
      .expect(401);
  });

  it('PATCH /api/users/me : corps vide → 422 VALIDATION_FAILED', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .send({})
      .expect(422);

    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('PATCH /api/users/me : sans cookie → 401 AUTH_REQUIRED', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/users/me')
      .send({ displayName: 'X' })
      .expect(401);

    expect(res.body.code).toBe('AUTH_REQUIRED');
  });
});
