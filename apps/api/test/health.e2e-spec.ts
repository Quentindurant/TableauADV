import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health repond 200 {status:"ok"}', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health (sans prefixe /api) repond 404', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(404);
  });

  it('GET /api/inexistant repond 404', async () => {
    const res = await request(app.getHttpServer()).get('/api/inexistant');
    expect(res.status).toBe(404);
  });
});
