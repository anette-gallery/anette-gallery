import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, hasRealValue } from '../config/env.config';

@Injectable()
export class OneCService {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  private isLiveEnabled(path: string | null): boolean {
    const mode = this.configService.get('integrations.mode', { infer: true });
    const baseUrl = this.configService.get('integrations.onec.baseUrl', {
      infer: true,
    });
    const login = this.configService.get('integrations.onec.login', {
      infer: true,
    });
    const password = this.configService.get('integrations.onec.password', {
      infer: true,
    });

    return (
      mode === 'live' &&
      hasRealValue(baseUrl) &&
      hasRealValue(login) &&
      hasRealValue(password) &&
      hasRealValue(path)
    );
  }

  private buildUrl(path: string): string {
    const baseUrl = this.configService.get('integrations.onec.baseUrl', {
      infer: true,
    });

    return new URL(path, baseUrl ?? 'http://localhost').toString();
  }

  private async post(path: string | null, action: string, payload: unknown) {
    if (!this.isLiveEnabled(path)) {
      return {
        status: 'stub',
        mode: 'stub',
        source: '1c',
        action,
        payload,
      };
    }

    const login = this.configService.get('integrations.onec.login', {
      infer: true,
    });
    const password = this.configService.get('integrations.onec.password', {
      infer: true,
    });
    const url = this.buildUrl(path ?? '/');
    const credentials = Buffer.from(`${login}:${password}`).toString('base64');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await response.text();

    return {
      status: response.ok ? 'ok' : 'error',
      mode: 'live',
      source: '1c',
      action,
      responseStatus: response.status,
      url,
      responseBody: body,
      payload,
    };
  }

  normalizeCatalogItem(payload: object) {
    return this.post(
      this.configService.get('integrations.onec.catalogSyncPath', {
        infer: true,
      }),
      'normalize-item',
      payload,
    );
  }

  normalizeCatalogBatch(items: object[]) {
    return this.post(
      this.configService.get('integrations.onec.catalogBatchSyncPath', {
        infer: true,
      }),
      'normalize-batch',
      { items },
    );
  }
}
