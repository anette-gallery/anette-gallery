import { getAppConfig, hasRealValue } from '@/server/config';
import type { SyncCatalogItemPayload } from '@/types/api';

function isLiveEnabled(path: string | null): boolean {
  const config = getAppConfig();

  return (
    config.integrations.mode === 'live' &&
    hasRealValue(config.integrations.onec.baseUrl) &&
    hasRealValue(config.integrations.onec.login) &&
    hasRealValue(config.integrations.onec.password) &&
    hasRealValue(path)
  );
}

function buildUrl(path: string): string {
  const baseUrl = getAppConfig().integrations.onec.baseUrl;
  return new URL(path, baseUrl ?? 'http://localhost').toString();
}

async function post(path: string | null, action: string, payload: unknown) {
  if (!isLiveEnabled(path)) {
    return {
      status: 'stub',
      mode: 'stub',
      source: '1c',
      action,
      payload,
    };
  }

  const config = getAppConfig();
  const url = buildUrl(path ?? '/');
  const credentials = Buffer.from(
    `${config.integrations.onec.login}:${config.integrations.onec.password}`,
  ).toString('base64');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
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

export function normalizeCatalogItem(payload: SyncCatalogItemPayload) {
  return post(
    getAppConfig().integrations.onec.catalogSyncPath,
    'normalize-item',
    payload,
  );
}

export function normalizeCatalogBatch(items: SyncCatalogItemPayload[]) {
  return post(
    getAppConfig().integrations.onec.catalogBatchSyncPath,
    'normalize-batch',
    { items },
  );
}
