import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, hasRealValue } from '../config/env.config';

@Injectable()
export class TildaService {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  private isLiveEnabled(path: string | null): boolean {
    const mode = this.configService.get('integrations.mode', { infer: true });
    const baseUrl = this.configService.get('integrations.tilda.baseUrl', {
      infer: true,
    });
    const apiKey = this.configService.get('integrations.tilda.apiKey', {
      infer: true,
    });

    return (
      mode === 'live' &&
      hasRealValue(baseUrl) &&
      hasRealValue(apiKey) &&
      hasRealValue(path)
    );
  }

  private buildUrl(path: string): string {
    const baseUrl = this.configService.get('integrations.tilda.baseUrl', {
      infer: true,
    });

    return new URL(path, baseUrl ?? 'http://localhost').toString();
  }

  private async post(path: string | null, action: string, payload: unknown) {
    if (!this.isLiveEnabled(path)) {
      return {
        status: 'stub',
        mode: 'stub',
        target: 'tilda',
        action,
        payload,
      };
    }

    const apiKey = this.configService.get('integrations.tilda.apiKey', {
      infer: true,
    });
    const url = this.buildUrl(path ?? '/');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await response.text();

    return {
      status: response.ok ? 'ok' : 'error',
      mode: 'live',
      target: 'tilda',
      action,
      responseStatus: response.status,
      url,
      responseBody: body,
      payload,
    };
  }

  upsertProduct(payload: object) {
    return this.post(
      this.configService.get('integrations.tilda.productUpsertPath', {
        infer: true,
      }),
      'upsert-product',
      payload,
    );
  }

  upsertProductsBatch(items: object[]) {
    return this.post(
      this.configService.get('integrations.tilda.productBatchUpsertPath', {
        infer: true,
      }),
      'upsert-products-batch',
      { items },
    );
  }
}
