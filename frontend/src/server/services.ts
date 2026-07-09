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

function validateDiscountCompatibility(payload: CalculateCheckoutPayload) {
  const hasLoyalty = Boolean(payload.phone);
  const hasPromo = Boolean(payload.promoCode);
  const hasGiftCard = Boolean(payload.giftCardNumber);

  return {
    canCombineLoyaltyAndGiftCard: hasLoyalty && hasGiftCard,
    canCombinePromoAndGiftCard: hasPromo && hasGiftCard,
    hasAllThree: hasLoyalty && hasPromo && hasGiftCard,
    hasUnsupportedCombination: hasLoyalty && hasPromo,
    discountPriority: 'discount-then-gift-card',
  };
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
  const compatibility = validateDiscountCompatibility(payload);

  if (compatibility.hasUnsupportedCombination) {
    const subtotal = payload.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    return Promise.resolve({
      status: 'validation_error',
      mode: 'stub',
      target: 'backend',
      action: 'calculate-checkout',
      subtotal,
      total: subtotal,
      discounts: [],
      payload,
      compatibility: {
        ...compatibility,
        message:
          'Карта лояльности и промокод не суммируются. Сначала применяется скидка, затем сертификат',
      },
      display: {
        showBeforeAndAfterTotals: true,
        showDiscountBreakdown: true,
      },
    });
  }

  return calculateCheckoutInMaxma(payload);
}

export function createOrder(payload: CreateOrderPayload) {
  return createOrderInMaxma(payload);
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
