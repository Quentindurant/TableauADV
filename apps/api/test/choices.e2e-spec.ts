import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { ChoiceDTO } from '@suivi/shared';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  closeConfigTestContext,
  createConfigTestContext,
  resetConfigTables,
  reseedConfigTables,
  type ConfigTestContext,
} from './helpers/config-test-app';

jest.setTimeout(30_000);

describe('Choix de listes (e2e)', () => {
  let ctx: ConfigTestContext;
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;

  beforeAll(async () => {
    ctx = await createConfigTestContext();
    app = ctx.app;
    prisma = ctx.prisma;
    cookie = ctx.cookie;
  });

  beforeEach(async () => {
    await resetConfigTables(prisma);
  });

  afterAll(async () => {
    await reseedConfigTables(prisma);
    await closeConfigTestContext(ctx);
  });

  /** Crée la colonne SELECT « INSTALLATION » (clé `statut`) et renvoie son id. */
  async function createSelectColumn(): Promise<string> {
    const column = await prisma.column.create({
      data: { key: 'statut', label: 'INSTALLATION', type: 'SELECT', position: 0, width: 150 },
    });
    return column.id;
  }

  describe('POST /api/columns/:columnId/choices', () => {
    it('refuse un appel sans cookie (401)', async () => {
      const columnId = await createSelectColumn();

      const res = await request(app.getHttpServer())
        .post(`/api/columns/${columnId}/choices`)
        .send({ label: 'NEW' });

      expect(res.status).toBe(401);
    });

    it('crée un choix avec couleurs, gras et position 0 puis 1', async () => {
      const columnId = await createSelectColumn();

      const first = await request(app.getHttpServer())
        .post(`/api/columns/${columnId}/choices`)
        .set('Cookie', cookie)
        .send({ label: 'NEW', bgColor: '#FFFF00', textColor: '#FF0000', bold: true });
      const second = await request(app.getHttpServer())
        .post(`/api/columns/${columnId}/choices`)
        .set('Cookie', cookie)
        .send({ label: 'STAGING' });

      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({
        columnId,
        label: 'NEW',
        bgColor: '#FFFF00',
        textColor: '#FF0000',
        bold: true,
        position: 0,
        archived: false,
      });
      expect(second.status).toBe(201);
      expect(second.body).toMatchObject({
        label: 'STAGING',
        bgColor: null,
        textColor: null,
        bold: false,
        position: 1,
      });
    });

    it('refuse un choix sur une colonne qui n\'est pas de type SELECT (422)', async () => {
      const column = await prisma.column.create({
        data: { key: 'client', label: 'CLIENT', type: 'TEXT', position: 0, width: 150 },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/columns/${column.id}/choices`)
        .set('Cookie', cookie)
        .send({ label: 'ARCADIA' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.message).toContain('CLIENT');
      expect(await prisma.choice.count()).toBe(0);
    });

    it('refuse un libellé déjà présent dans la liste (422)', async () => {
      const columnId = await createSelectColumn();
      await request(app.getHttpServer())
        .post(`/api/columns/${columnId}/choices`)
        .set('Cookie', cookie)
        .send({ label: 'NEW' });

      const res = await request(app.getHttpServer())
        .post(`/api/columns/${columnId}/choices`)
        .set('Cookie', cookie)
        .send({ label: '  NEW  ' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.message).toContain('NEW');
      expect(await prisma.choice.count()).toBe(1);
    });

    it('renvoie 404 NOT_FOUND si la colonne n\'existe pas', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/columns/col_inexistante/choices')
        .set('Cookie', cookie)
        .send({ label: 'NEW' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.message).toBe('Colonne introuvable.');
    });

    it('refuse un libellé vide (422 VALIDATION_FAILED)', async () => {
      const columnId = await createSelectColumn();

      const res = await request(app.getHttpServer())
        .post(`/api/columns/${columnId}/choices`)
        .set('Cookie', cookie)
        .send({ label: '   ' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.message).toBe('Données invalides.');
    });
  });
});
