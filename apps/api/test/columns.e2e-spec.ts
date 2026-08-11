import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { ColumnDTO } from '@suivi/shared';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  closeConfigTestContext,
  createConfigTestContext,
  resetConfigTables,
  reseedConfigTables,
  type ConfigTestContext,
} from './helpers/config-test-app';

jest.setTimeout(30_000);

describe('Colonnes (e2e)', () => {
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
    // Restaure la base de données au état seedé pour les suites voisines
    await reseedConfigTables(prisma);
    await closeConfigTestContext(ctx);
  });

  describe('GET /api/columns', () => {
    it('refuse un appel sans cookie (401)', async () => {
      const res = await request(app.getHttpServer()).get('/api/columns');
      expect(res.status).toBe(401);
    });

    it("renvoie un tableau vide quand aucune colonne n'existe", async () => {
      const res = await request(app.getHttpServer()).get('/api/columns').set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('trie les colonnes par position et les choix par position', async () => {
      await prisma.column.create({
        data: { key: 'client', label: 'CLIENT', type: 'TEXT', position: 1, width: 200 },
      });
      await prisma.column.create({
        data: {
          key: 'statut',
          label: 'INSTALLATION',
          type: 'SELECT',
          position: 0,
          width: 150,
          choices: {
            create: [
              { label: 'CLOTUREE', position: 1, bgColor: '#A6A6A6', textColor: '#ABEBC6' },
              { label: 'NEW', position: 0, bgColor: '#FFFF00', textColor: '#FF0000', bold: true },
            ],
          },
        },
      });

      const res = await request(app.getHttpServer()).get('/api/columns').set('Cookie', cookie);

      expect(res.status).toBe(200);
      const columns = res.body as ColumnDTO[];
      expect(columns.map((c) => c.key)).toEqual(['statut', 'client']);
      expect(columns[0].choices.map((c) => c.label)).toEqual(['NEW', 'CLOTUREE']);
      expect(columns[0].choices[0]).toMatchObject({
        label: 'NEW',
        bgColor: '#FFFF00',
        textColor: '#FF0000',
        bold: true,
        position: 0,
        archived: false,
      });
      expect(columns[1]).toMatchObject({
        key: 'client',
        label: 'CLIENT',
        type: 'TEXT',
        position: 1,
        width: 200,
        visible: true,
        choices: [],
      });
    });
  });
});
