import { getAppConfig, hasRealValue } from '@/server/config';
import { checkDatabaseConnection, isDatabaseConfigured } from '@/server/database';
import {
  applyLoyalty as applyLoyaltyInMaxma,
  calculateCheckout as calculateCheckoutInMaxma,
  syncCustomer as syncCustomerInMaxma,
  validateGiftCard as validateGiftCardInMaxma,
  validatePromoCode as validatePromoCodeInMaxma,
} from '@/server/integrations/maxma';
import { createOrderAsLead, getAmoCrmStatus } from '@/server/integrations/amocrm';
import {
  normalizeCatalogBatch,
  normalizeCatalogItem,
} from '@/server/integrations/onec';
import {
  upsertProduct,
  upsertProductsBatch,
} from '@/server/integrations/tilda';
import { isPaykeeperConfigured } from '@/server/integrations/paykeeper';
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
      paykeeper: {
        configured: isPaykeeperConfigured(),
      },
      amocrm: getAmoCrmStatus(),
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
  let maxmaDiscountInfo: {
    subtotal: number;
    totalDiscount: number;
    prepaidAmount: number;
    finalTotal: number;
    promoCode?: string;
    giftCardNumber?: string;
    loyaltyApplied?: boolean;
    discountBreakdown?: unknown;
  } | null = null;
  let amoLead: { status?: string; leadId?: number; [key: string]: unknown } = {
    status: 'skipped',
    reason: 'amocrm-unreachable',
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

  try {
    const checkoutCalcPayload: CalculateCheckoutPayload = {
      phone: payload.customer.phone,
      promoCode: payload.promoCode,
      giftCardNumber: payload.giftCardNumber,
      registerInLoyaltyProgram: payload.registerInLoyaltyProgram,
      items: payload.items.map((item) => ({
        sku: item.sku,
        title: item.title,
        image: item.image,
        category: item.category,
        categoryExternalId: item.categoryExternalId,
        externalId: item.externalId,
        vatPercent: item.vatPercent,
        quantity: item.quantity,
        price: item.price ?? 0,
      })),
    };

    const calcResult = await calculateCheckoutInMaxma(checkoutCalcPayload);
    const subtotal =
      typeof (calcResult as Record<string, unknown>).subtotal === 'number'
        ? ((calcResult as Record<string, unknown>).subtotal as number)
        : payload.items.reduce((s, i) => s + (i.price ?? 0) * i.quantity, 0);
    const total =
      typeof (calcResult as Record<string, unknown>).total === 'number'
        ? ((calcResult as Record<string, unknown>).total as number)
        : payload.totalAmount;

    const discountArr =
      Array.isArray((calcResult as Record<string, unknown>).discounts) &&
      ((calcResult as Record<string, unknown>).discounts as unknown[]).length > 0
        ? (((calcResult as Record<string, unknown>).discounts as unknown[])[0] as Record<string, unknown>)
        : null;

    const totalDiscount =
      discountArr && typeof discountArr.totalDiscount === 'number'
        ? (discountArr.totalDiscount as number)
        : Math.max(0, subtotal - total);
    const prepaidAmount =
      discountArr && typeof discountArr.prepaidAmount === 'number'
        ? (discountArr.prepaidAmount as number)
        : 0;

    const loyaltyData =
      typeof (calcResult as Record<string, unknown>).loyalty === 'object' &&
      (calcResult as Record<string, unknown>).loyalty !== null
        ? ((calcResult as Record<string, unknown>).loyalty as Record<string, unknown>)
        : null;
    const promocodeData =
      typeof (calcResult as Record<string, unknown>).promocode === 'object' &&
      (calcResult as Record<string, unknown>).promocode !== null
        ? ((calcResult as Record<string, unknown>).promocode as Record<string, unknown>)
        : null;
    const giftCardsArr = Array.isArray((calcResult as Record<string, unknown>).giftCards)
      ? (((calcResult as Record<string, unknown>).giftCards as unknown[]).length > 0
          ? ((calcResult as Record<string, unknown>).giftCards as unknown[])
          : null)
      : null;

    maxmaDiscountInfo = {
      subtotal,
      totalDiscount,
      prepaidAmount,
      finalTotal: total,
      promoCode: promocodeData
        ? typeof (promocodeData as Record<string, unknown>).code === 'string'
          ? ((promocodeData as Record<string, unknown>).code as string)
          : undefined
        : payload.promoCode,
      giftCardNumber: giftCardsArr
        ? typeof giftCardsArr[0] === 'object' && giftCardsArr[0] !== null && 'code' in (giftCardsArr[0] as Record<string, unknown>)
          ? ((giftCardsArr[0] as Record<string, unknown>).code as string)
          : undefined
        : payload.giftCardNumber,
      loyaltyApplied: loyaltyData
        ? Boolean((loyaltyData as Record<string, unknown>).bonuses)
        : undefined,
      discountBreakdown: discountArr ?? undefined,
    };
  } catch (err) {
    maxmaDiscountInfo = null;
  }

  try {
    amoLead = await createOrderAsLead(payload, {
      txid: options?.txid,
      maxmaDiscountInfo: maxmaDiscountInfo ?? undefined,
    }) as { status?: string; leadId?: number; [key: string]: unknown };
  } catch (err) {
    amoLead = {
      status: 'degraded',
      reason: 'amocrm-lead-fetch-failed',
      mode: 'fallback',
      rawError:
        err instanceof Error
          ? { name: err.name, message: err.message }
          : String(err ?? '').slice(0, 400),
    };
  }

  const amoStatus =
    amoLead && typeof amoLead === 'object' && typeof amoLead.status === 'string'
      ? amoLead.status
      : 'degraded';

  if (amoStatus === 'ok' || amoStatus === 'stub' || amoStatus === 'degraded') {
    return {
      status: 'ok',
      id:
        (amoLead && typeof amoLead.leadId === 'number'
          ? String(amoLead.leadId)
          : (amoLead && typeof (amoLead as Record<string, unknown>).id === 'string'
              ? ((amoLead as Record<string, unknown>).id as string)
              : null)) || null,
      degradedMode:
        amoStatus === 'degraded'
          ? ((amoLead as Record<string, unknown>).reason as string | undefined) ?? 'amocrm-unreachable'
          : undefined,
      customerSync,
      maxmaDiscounts: maxmaDiscountInfo,
      amocrm: amoLead,
    };
  }

  return {
    ...(amoLead as Record<string, unknown>),
    customerSync,
    maxmaDiscounts: maxmaDiscountInfo,
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
