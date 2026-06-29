import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, hasRealValue } from '../../config/env.config';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly databaseService: DatabaseService,
  ) {}

  async getHealth() {
    const database = await this.databaseService.checkConnection();

    return {
      status: database.configured && !database.connected ? 'degraded' : 'ok',
      service: 'lapaloma-integrations-api',
      mode: this.configService.get('integrations.mode', { infer: true }),
      timestamp: new Date().toISOString(),
      database,
      integrations: {
        maxma: {
          configured:
            hasRealValue(
              this.configService.get('integrations.maxma.baseUrl', {
                infer: true,
              }),
            ) &&
            hasRealValue(
              this.configService.get('integrations.maxma.apiKey', {
                infer: true,
              }),
            ),
        },
        onec: {
          configured:
            hasRealValue(
              this.configService.get('integrations.onec.baseUrl', {
                infer: true,
              }),
            ) &&
            hasRealValue(
              this.configService.get('integrations.onec.login', {
                infer: true,
              }),
            ) &&
            hasRealValue(
              this.configService.get('integrations.onec.password', {
                infer: true,
              }),
            ),
        },
        tilda: {
          configured:
            hasRealValue(
              this.configService.get('integrations.tilda.baseUrl', {
                infer: true,
              }),
            ) &&
            hasRealValue(
              this.configService.get('integrations.tilda.apiKey', {
                infer: true,
              }),
            ),
        },
      },
    };
  }
}
