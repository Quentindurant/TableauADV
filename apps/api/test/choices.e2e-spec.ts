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

  describe('PATCH /api/choices/:id', () => {
    it('met à jour couleurs, gras et archivage', async () => {
      const columnId = await createSelectColumn();
      const choice = await prisma.choice.create({
        data: { columnId, label: 'STAND BY', position: 0 },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/choices/${choice.id}`)
        .set('Cookie', cookie)
        .send({ bgColor: '#85C1E9', textColor: '#002060', bold: true, archived: true });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        label: 'STAND BY',
        bgColor: '#85C1E9',
        textColor: '#002060',
        bold: true,
        archived: true,
      });
    });

    it('remet une couleur à null (retour au neutre)', async () => {
      const columnId = await createSelectColumn();
      const choice = await prisma.choice.create({
        data: { columnId, label: 'A DISTANCE', position: 0, bgColor: '#FFFFFF' },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/choices/${choice.id}`)
        .set('Cookie', cookie)
        .send({ bgColor: null });

      expect(res.status).toBe(200);
      expect((res.body as ChoiceDTO).bgColor).toBeNull();
    });

    it(`propage le renommage aux lignes qui portaient l'ancienne valeur`, async () => {
      const columnId = await createSelectColumn();
      const choice = await prisma.choice.create({
        data: { columnId, label: 'ATT CLIENT', position: 0 },
      });
      const touched1 = await prisma.row.create({
        data: { month: '2026-08', position: 0, data: { statut: 'ATT CLIENT', client: 'ARCADIA' } },
      });
      const touched2 = await prisma.row.create({
        data: { month: '2026-09', position: 0, data: { statut: 'ATT CLIENT' } },
      });
      const untouched = await prisma.row.create({
        data: { month: '2026-08', position: 1, data: { statut: 'NEW' } },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/choices/${choice.id}`)
        .set('Cookie', cookie)
        .send({ label: 'ATTENTE CLIENT' });

      expect(res.status).toBe(200);
      expect((res.body as ChoiceDTO).label).toBe('ATTENTE CLIENT');

      const after1 = await prisma.row.findUniqueOrThrow({ where: { id: touched1.id } });
      const after2 = await prisma.row.findUniqueOrThrow({ where: { id: touched2.id } });
      const afterUntouched = await prisma.row.findUniqueOrThrow({ where: { id: untouched.id } });
      expect(after1.data).toEqual({ statut: 'ATTENTE CLIENT', client: 'ARCADIA' });
      expect(after2.data).toEqual({ statut: 'ATTENTE CLIENT' });
      expect(afterUntouched.data).toEqual({ statut: 'NEW' });
    });

    it(`n'ajoute pas la clé aux lignes qui ne l'avaient pas`, async () => {
      const columnId = await createSelectColumn();
      const choice = await prisma.choice.create({
        data: { columnId, label: 'NEW', position: 0 },
      });
      const row = await prisma.row.create({
        data: { month: '2026-08', position: 0, data: { client: 'ARCADIA' } },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/choices/${choice.id}`)
        .set('Cookie', cookie)
        .send({ label: 'NOUVEAU' });

      expect(res.status).toBe(200);
      const after = await prisma.row.findUniqueOrThrow({ where: { id: row.id } });
      expect(after.data).toEqual({ client: 'ARCADIA' });
    });

    it('refuse un renommage vers un libellé déjà présent dans la liste (422)', async () => {
      const columnId = await createSelectColumn();
      await prisma.choice.create({ data: { columnId, label: 'NEW', position: 0 } });
      const second = await prisma.choice.create({
        data: { columnId, label: 'STAGING', position: 1 },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/choices/${second.id}`)
        .set('Cookie', cookie)
        .send({ label: 'NEW' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.message).toContain('NEW');
    });

    it('réordonne les choix de la liste', async () => {
      const columnId = await createSelectColumn();
      await prisma.choice.create({ data: { columnId, label: 'NEW', position: 0 } });
      await prisma.choice.create({ data: { columnId, label: 'STAGING', position: 1 } });
      const third = await prisma.choice.create({
        data: { columnId, label: 'CLOTUREE', position: 2 },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/choices/${third.id}`)
        .set('Cookie', cookie)
        .send({ position: 0 });

      expect(res.status).toBe(200);
      expect((res.body as ChoiceDTO).position).toBe(0);
      const ordered = await prisma.choice.findMany({ where: { columnId }, orderBy: { position: 'asc' } });
      expect(ordered.map((choice) => choice.label)).toEqual(['CLOTUREE', 'NEW', 'STAGING']);
    });

    it('renvoie 404 NOT_FOUND pour un id inconnu', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/choices/choix_inexistant')
        .set('Cookie', cookie)
        .send({ label: 'PEU IMPORTE' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.message).toBe('Valeur de liste introuvable.');
    });

    it('refuse une couleur non hexadécimale (422 VALIDATION_FAILED)', async () => {
      const columnId = await createSelectColumn();
      const choice = await prisma.choice.create({
        data: { columnId, label: 'NEW', position: 0 },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/choices/${choice.id}`)
        .set('Cookie', cookie)
        .send({ bgColor: 'rouge' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.message).toBe('Données invalides.');
    });
  });

  describe('DELETE /api/choices/:id', () => {
    it('supprime un choix inutilisé (204)', async () => {
      const columnId = await createSelectColumn();
      const choice = await prisma.choice.create({
        data: { columnId, label: 'A DISTANCE', position: 0 },
      });
      await prisma.row.create({
        data: { month: '2026-08', position: 0, data: { statut: 'NEW' } },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/choices/${choice.id}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(204);
      expect(await prisma.choice.count()).toBe(0);
    });

    it('refuse la suppression d\'un choix utilisé (409 CHOICE_IN_USE) et conseille l\'archivage', async () => {
      const columnId = await createSelectColumn();
      const choice = await prisma.choice.create({
        data: { columnId, label: 'ATT PV', position: 0 },
      });
      await prisma.row.create({
        data: { month: '2026-08', position: 0, data: { statut: 'ATT PV' } },
      });
      await prisma.row.create({
        data: { month: '2026-09', position: 0, data: { statut: 'ATT PV' } },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/choices/${choice.id}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CHOICE_IN_USE');
      expect(res.body.message).toContain('ATT PV');
      expect(res.body.message).toContain('Archivez');
      expect(res.body.details).toEqual({ rowCount: 2 });
      expect(await prisma.choice.count()).toBe(1);
    });

    it('ne bloque pas sur une valeur identique portée par une autre colonne', async () => {
      const statutId = await createSelectColumn();
      const parte = await prisma.column.create({
        data: { key: 'partenaire', label: 'PARTE', type: 'SELECT', position: 1, width: 150 },
      });
      const choice = await prisma.choice.create({
        data: { columnId: statutId, label: 'CUBE', position: 0 },
      });
      await prisma.choice.create({ data: { columnId: parte.id, label: 'CUBE', position: 0 } });
      await prisma.row.create({
        data: { month: '2026-08', position: 0, data: { partenaire: 'CUBE' } },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/choices/${choice.id}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(204);
    });

    it('renvoie 404 NOT_FOUND pour un id inconnu', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/choices/choix_inexistant')
        .set('Cookie', cookie);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.message).toBe('Valeur de liste introuvable.');
    });

    it('refuse un appel sans cookie (401)', async () => {
      const columnId = await createSelectColumn();
      const choice = await prisma.choice.create({
        data: { columnId, label: 'NEW', position: 0 },
      });

      const res = await request(app.getHttpServer()).delete(`/api/choices/${choice.id}`);

      expect(res.status).toBe(401);
    });
  });
});
