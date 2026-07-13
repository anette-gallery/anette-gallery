import type { IntegrationMode } from '@/types/api';

export type AppConfig = {
  server: {
    port: number;
    corsOrigin: string;
  };
  frontend: {
    publicUrl: string | null;
  };
  database: {
    url: string | null;
  };
  integrations: {
    mode: IntegrationMode;
    maxma: {
      baseUrl: string | null;
      apiKey: string | null;
      shopCode: string | null;
      shopName: string | null;
      webhookUsername: string | null;
      webhookPassword: string | null;
      newClientPath: string | null;
      customerSyncPath: string | null;
      loyaltyApplyPath: string | null;
      checkoutCalculatePath: string | null;
      promoValidatePath: string | null;
      giftCardValidatePath: string | null;
      orderCreatePath: string | null;
    };
    onec: {
      baseUrl: string | null;
      login: string | null;
      password: string | null;
      catalogSyncPath: string | null;
      catalogBatchSyncPath: string | null;
    };
    tilda: {
      baseUrl: string | null;
      apiKey: string | null;
      webhookSecret: string | null;
      productUpsertPath: string | null;
      productBatchUpsertPath: string | null;
    };
  };
};

function toOptionalString(value?: string): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed === 'replace-me') {
    return null;
  }

  return trimmed;
}

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function hasRealValue(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  return !value.includes('example') && value !== 'replace-me';
}

export function getAppConfig(): AppConfig {
  return {
    server: {
      port: toNumber(process.env.PORT, 3000),
      corsOrigin: process.env.CORS_ORIGIN?.trim() || '*',
    },
    frontend: {
      publicUrl: toOptionalString(process.env.FRONTEND_PUBLIC_URL),
    },
    database: {
      url: toOptionalString(process.env.DATABASE_URL),
    },
    integrations: {
      mode: process.env.INTEGRATIONS_MODE === 'live' ? 'live' : 'stub',
      maxma: {
        baseUrl: toOptionalString(process.env.MAXMA_API_URL),
        apiKey: toOptionalString(process.env.MAXMA_API_KEY),
        shopCode: toOptionalString(process.env.MAXMA_SHOP_CODE),
        shopName: toOptionalString(process.env.MAXMA_SHOP_NAME),
        webhookUsername: toOptionalString(process.env.MAXMA_WEBHOOK_USERNAME),
        webhookPassword: toOptionalString(process.env.MAXMA_WEBHOOK_PASSWORD),
        newClientPath:
          toOptionalString(process.env.MAXMA_NEW_CLIENT_PATH) ?? '/new-client',
        customerSyncPath:
          toOptionalString(process.env.MAXMA_CUSTOMER_SYNC_PATH) ??
          '/update-client',
        loyaltyApplyPath:
          toOptionalString(process.env.MAXMA_LOYALTY_APPLY_PATH) ??
          '/v2/calculate-purchase',
        checkoutCalculatePath:
          toOptionalString(process.env.MAXMA_CHECKOUT_CALCULATE_PATH) ??
          '/v2/calculate-purchase',
        promoValidatePath:
          toOptionalString(process.env.MAXMA_PROMO_VALIDATE_PATH) ??
          '/v2/calculate-purchase',
        giftCardValidatePath:
          toOptionalString(process.env.MAXMA_GIFT_CARD_VALIDATE_PATH) ??
          '/v2/calculate-purchase',
        orderCreatePath:
          toOptionalString(process.env.MAXMA_ORDER_CREATE_PATH) ?? '/set-purchase',
      },
      onec: {
        baseUrl: toOptionalString(process.env.ONEC_API_URL),
        login: toOptionalString(process.env.ONEC_API_LOGIN),
        password: toOptionalString(process.env.ONEC_API_PASSWORD),
        catalogSyncPath:
          toOptionalString(process.env.ONEC_CATALOG_SYNC_PATH) ??
          '/catalog/sync',
        catalogBatchSyncPath:
          toOptionalString(process.env.ONEC_CATALOG_BATCH_SYNC_PATH) ??
          '/catalog/sync/batch',
      },
      tilda: {
        baseUrl: toOptionalString(process.env.TILDA_API_URL),
        apiKey: toOptionalString(process.env.TILDA_API_KEY),
        webhookSecret: toOptionalString(process.env.TILDA_WEBHOOK_SECRET),
        productUpsertPath:
          toOptionalString(process.env.TILDA_PRODUCT_UPSERT_PATH) ??
          '/products/upsert',
        productBatchUpsertPath:
          toOptionalString(process.env.TILDA_PRODUCTS_BATCH_UPSERT_PATH) ??
          '/products/batch-upsert',
      },
    },
  };
}
