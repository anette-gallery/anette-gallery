import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './database/database.service';
import { ConfigService } from '@nestjs/config';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'integrations.mode') {
                return 'stub';
              }

              return undefined;
            },
          },
        },
        {
          provide: DatabaseService,
          useValue: {
            isConfigured: () => false,
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return project metadata', () => {
      expect(appController.getInfo()).toEqual({
        name: 'lapaloma-integrations-api',
        version: '0.1.0',
        description: 'Backend API for Tilda, Maxma and 1C integrations',
        basePath: '/api/v1',
        modules: ['health', 'customers', 'checkout', 'orders', 'catalog'],
        integrationsMode: 'stub',
        databaseConfigured: false,
      });
    });
  });
});
