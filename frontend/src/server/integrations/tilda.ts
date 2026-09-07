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

async function request(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string | null,
  action: string,
  payload?: unknown,
) {
  if (!isLiveEnabled(path)) {
    return {
      status: 'stub' as const,
      mode: 'stub' as const,
      target: 'tilda' as const,
      action,
      payload,
    };
  }

  const config = getAppConfig();
  const url = buildUrl(path ?? '/');
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.integrations.tilda.apiKey}`,
    },
    cache: 'no-store',
  };

  if (payload !== undefined && method !== 'GET' && method !== 'DELETE') {
    init.body = JSON.stringify(payload);
  }

  const response = await fetch(url, init);
  const body = await response.text();

  return {
    status: response.ok ? ('ok' as const) : ('error' as const),
    mode: 'live' as const,
    target: 'tilda' as const,
    action,
    responseStatus: response.status,
    url,
    responseBody: body,
    payload,
  };
}

function post(path: string | null, action: string, payload: unknown) {
  return request('POST', path, action, payload);
}

function patch(path: string | null, action: string, payload: unknown) {
  return request('PATCH', path, action, payload);
}

function get(path: string | null, action: string) {
  return request('GET', path, action);
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

export function getProduct(productId: string) {
  return get(`/catalog/products/${encodeURIComponent(productId)}`, 'get-product');
}

export function getProductBySku(sku: string) {
  return get(
    `/catalog/products?sku=${encodeURIComponent(sku)}`,
    'get-product-by-sku',
  );
}

export function updateProduct(
  productId: string,
  payload: Record<string, unknown>,
) {
  return patch(
    `/catalog/products/${encodeURIComponent(productId)}`,
    'update-product',
    payload,
  );
}

export function setProductSpec(
  productId: string,
  specId: string,
  value: string,
) {
  return post(
    `/catalog/update-product/${encodeURIComponent(productId)}`,
    'set-product-spec',
    {
      specs: [{ id: specId, value }],
    },
  );
}

export function appendProductCategory(
  productId: string,
  categoryId: string,
  existingCategoryIds: string[] = [],
) {
  const merged = Array.from(
    new Set([...existingCategoryIds.map(String), String(categoryId)]),
  );
  return patch(
    `/catalog/products/${encodeURIComponent(productId)}`,
    'append-product-category',
    {
      category_id: merged,
    },
  );
}

export function applyBrandToProduct(
  productId: string,
  options: {
    brand?: string;
    brandSpecId?: string | null;
    brandCategoryId?: string | null;
    existingCategoryIds?: string[];
  },
) {
  const results: Array<{
    step: string;
    result: ReturnType<typeof setProductSpec> | ReturnType<typeof appendProductCategory>;
  }> = [];
  const { brand, brandSpecId, brandCategoryId, existingCategoryIds = [] } = options;

  if (!brand) {
    return Promise.resolve({
      status: 'skipped' as const,
      reason: 'no-brand',
      steps: results,
    });
  }

  if (brandSpecId) {
    results.push({
      step: 'spec',
      result: setProductSpec(productId, brandSpecId, brand),
    });
  }

  if (brandCategoryId) {
    results.push({
      step: 'category',
      result: appendProductCategory(
        productId,
        brandCategoryId,
        existingCategoryIds,
      ),
    });
  }

  return Promise.resolve({
    status: results.length > 0 ? ('applied' as const) : ('skipped' as const),
    reason: results.length > 0 ? 'applied' : 'no-targets-configured',
    steps: results,
  });
}
