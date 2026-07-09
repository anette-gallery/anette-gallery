import { getAppConfig, hasRealValue } from '@/server/config';
import type { SyncCatalogItemPayload } from '@/types/api';

function isLiveEnabled(path: string | null): boolean {
  const config = getAppConfig();

  return (
    config.integrations.mode === 'live' &&
    hasRealValue(config.integrations.tilda.baseUrl) &&
    hasRealValue(config.integrations.tilda.apiKey) &&
    hasRealValue(path)
  );
}

function buildUrl(path: string): string {
  const baseUrl = getAppConfig().integrations.tilda.baseUrl;
  return new URL(path, baseUrl ?? 'http://localhost').toString();
}

async function post(path: string | null, action: string, payload: unknown) {
  if (!isLiveEnabled(path)) {
    return {
      status: 'stub',
      mode: 'stub',
      target: 'tilda',
      action,
      payload,
    };
  }

  const config = getAppConfig();
  const url = buildUrl(path ?? '/');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.integrations.tilda.apiKey}`,
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
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

export function upsertProduct(payload: SyncCatalogItemPayload) {
  return post(
    getAppConfig().integrations.tilda.productUpsertPath,
    'upsert-product',
    payload,
  );
}

export function upsertProductsBatch(items: SyncCatalogItemPayload[]) {
  return post(
    getAppConfig().integrations.tilda.productBatchUpsertPath,
    'upsert-products-batch',
    { items },
  );
}
