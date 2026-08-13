import { readFileSync } from 'node:fs';
import { getAppConfig, hasRealValue } from '@/server/config';
import { checkDatabaseConnection, isDatabaseConfigured } from '@/server/database';
import {
  applyLoyalty as applyLoyaltyInMaxma,
  calculateCheckout as calculateCheckoutInMaxma,
  createOrder as createOrderInMaxma,
  syncCustomer as syncCustomerInMaxma,
  validateGiftCard as validateGiftCardInMaxma,
  validatePromoCode as validatePromoCodeInMaxma,
} from '@/server/integrations/maxma';
import {
  normalizeCatalogBatch,
  normalizeCatalogItem,
} from '@/server/integrations/onec';
import {
  upsertProduct,
  upsertProductsBatch,
} from '@/server/integrations/tilda';
import type {
  CalculateCheckoutPayload,
  CreateOrderPayload,
  SyncCatalogBatchPayload,
  SyncCatalogItemPayload,
  SyncCustomerPayload,
} from '@/types/api';

export function getAppInfo() {
  return {
    name: 'lapaloma-next-api',
    version: '0.1.0',
    description: 'Next.js API for Tilda, Maxma and 1C integrations',
    basePath: '/api/v1',
    modules: ['health', 'customers', 'checkout', 'orders', 'catalog'],
    integrationsMode: getAppConfig().integrations.mode,
    databaseConfigured: isDatabaseConfigured(),
  };
}

export async function getHealth() {
  const config = getAppConfig();
  const database = await checkDatabaseConnection();

  return {
    status: database.configured && !database.connected ? 'degraded' : 'ok',
    service: 'lapaloma-next-api',
    mode: config.integrations.mode,
    timestamp: new Date().toISOString(),
    database,
    integrations: {
      maxma: {
        configured:
          hasRealValue(config.integrations.maxma.baseUrl) &&
          hasRealValue(config.integrations.maxma.apiKey),
      },
      onec: {
        configured:
          hasRealValue(config.integrations.onec.baseUrl) &&
          hasRealValue(config.integrations.onec.login) &&
          hasRealValue(config.integrations.onec.password),
      },
      tilda: {
        configured:
          hasRealValue(config.integrations.tilda.baseUrl) &&
          hasRealValue(config.integrations.tilda.apiKey),
      },
    },
  };
}

export function syncCustomer(payload: SyncCustomerPayload) {
  return syncCustomerInMaxma(payload);
}

export function applyLoyalty(payload: CalculateCheckoutPayload) {
  return applyLoyaltyInMaxma(payload);
}

export function validatePromoCode(payload: CalculateCheckoutPayload) {
  return validatePromoCodeInMaxma(payload);
}

export function validateGiftCard(payload: CalculateCheckoutPayload) {
  return validateGiftCardInMaxma(payload);
}

export function calculateCheckout(payload: CalculateCheckoutPayload) {
  if (payload.registerInLoyaltyProgram) {
    return applyLoyaltyInMaxma(payload);
  }

  return calculateCheckoutInMaxma(payload);
}

export async function createOrder(
  payload: CreateOrderPayload,
  options?: { txid?: string },
) {
  let customerSync: { status?: string; [key: string]: unknown } = {
    status: 'skipped',
    reason: 'maxma-unreachable',
    mode: 'fallback',
  };
  let order: { status?: string; id?: string | null; [key: string]: unknown } = {
    status: 'skipped',
    reason: 'maxma-unreachable',
    mode: 'fallback',
  };

  try {
    customerSync = await syncCustomerInMaxma({
      fullName: payload.customer.fullName,
      phone: payload.customer.phone,
      email: payload.customer.email ?? undefined,
      address: payload.customer.address,
      loyaltyCardNumber: payload.loyaltyCardNumber,
    }) as { status?: string; [key: string]: unknown };
  } catch (err) {
    customerSync = {
      status: 'degraded',
      reason: 'customer-sync-fetch-failed',
      mode: 'fallback',
      rawError:
        err instanceof Error
          ? { name: err.name, message: err.message }
          : String(err ?? '').slice(0, 400),
    };
  }

  if (customerSync.status !== 'error' && customerSync.reason !== 'customer-sync-fetch-failed') {
    try {
      order = await createOrderInMaxma(payload, options) as { status?: string; id?: string | null; [key: string]: unknown };
    } catch (err) {
      order = {
        status: 'degraded',
        reason: 'create-order-fetch-failed',
        mode: 'fallback',
        rawError:
          err instanceof Error
            ? { name: err.name, message: err.message }
            : String(err ?? '').slice(0, 400),
      };
    }
  } else if (customerSync.status === 'error') {
    order = {
      status: 'error',
      action: 'create-order',
      orderSkipped: true,
      reason: 'customer_sync_failed',
      orderPayload: payload,
      customerSync,
    };
    return order;
  }

  const orderStatus =
    order && typeof order === 'object' && typeof order.status === 'string'
      ? order.status
      : 'degraded';

  if (orderStatus === 'ok' || orderStatus === 'degraded') {
    return {
      status: 'ok',
      id:
        (order && typeof order.id === 'string' && order.id) ||
        null,
      degradedMode: orderStatus === 'degraded' ? (order.reason ?? 'maxma-unreachable') : undefined,
      customerSync,
      order,
    };
  }

  return {
    ...(order as Record<string, unknown>),
    customerSync,
  };
}

function buildOverrideMeta(payload: SyncCatalogItemPayload) {
  const manualOverrideFields = payload.manualOverrideFields ?? [];
  const preserveTildaOverrides = payload.preserveTildaOverrides ?? true;
  const sourceUpdatedAt = payload.sourceUpdatedAt ?? null;
  const tildaUpdatedAt = payload.tildaUpdatedAt ?? null;
  const missingInOneC = payload.missingInOneC ?? false;

  return {
    manualOverrideFields,
    preserveTildaOverrides,
    hasManualOverrides: manualOverrideFields.length > 0,
    missingInOneC,
    visibilityAction: missingInOneC ? 'hide-in-tilda' : 'keep-visible',
    sourceUpdatedAt,
    tildaUpdatedAt,
    synchronizationMode: 'last-write-wins',
    priorityRule:
      'Последнее изменение между 1С и Tilda должно иметь приоритет, если доступны корректные timestamps',
  };
}

export function syncCatalogItem(payload: SyncCatalogItemPayload) {
  const overrideMeta = buildOverrideMeta(payload);
  const normalized = normalizeCatalogItem(payload);
  const synced = upsertProduct(payload);

  return {
    status: 'stub',
    source: '1c',
    target: 'tilda',
    action: 'sync-item',
    overrideMeta,
    normalized,
    synced,
  };
}

export function syncCatalogBatch(payload: SyncCatalogBatchPayload) {
  const overrideSummary = payload.items.map((item) => ({
    sku: item.sku,
    ...buildOverrideMeta(item),
  }));
  const normalized = normalizeCatalogBatch(payload.items);
  const synced = upsertProductsBatch(payload.items);

  return {
    status: 'stub',
    source: '1c',
    target: 'tilda',
    action: 'sync-batch',
    itemsCount: payload.items.length,
    overrideSummary,
    normalized,
    synced,
  };
}
