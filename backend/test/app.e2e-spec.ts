import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  it('/ (GET)', async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleFixture.createNestApplication();
    await app.init();

    try {
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      await request(server)
        .get('/')
        .expect(200)
        .expect({
          name: 'lapaloma-integrations-api',
          version: '0.1.0',
          description: 'Backend API for Tilda, Maxma and 1C integrations',
          basePath: '/api/v1',
          modules: ['health', 'customers', 'checkout', 'orders', 'catalog'],
          integrationsMode: 'stub',
          databaseConfigured: false,
        });
    } finally {
      await app.close();
    }
  });
});
