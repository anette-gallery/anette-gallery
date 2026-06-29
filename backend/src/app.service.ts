import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from './config/env.config';
import { DatabaseService } from './database/database.service';

@Injectable()
export class AppService {
  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly databaseService: DatabaseService,
  ) {}

  getInfo() {
    return {
      name: 'lapaloma-integrations-api',
      version: '0.1.0',
      description: 'Backend API for Tilda, Maxma and 1C integrations',
      basePath: '/api/v1',
      modules: ['health', 'customers', 'checkout', 'orders', 'catalog'],
      integrationsMode: this.configService.get('integrations.mode', {
        infer: true,
      }),
      databaseConfigured: this.databaseService.isConfigured(),
    };
  }
}
