export type IntegrationMode = 'stub' | 'live';

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

export default (): AppConfig => ({
  server: {
    port: toNumber(process.env.PORT, 4000),
    corsOrigin: process.env.CORS_ORIGIN?.trim() || 'http://localhost:3000',
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
      customerSyncPath:
        toOptionalString(process.env.MAXMA_CUSTOMER_SYNC_PATH) ??
        '/customers/sync',
      loyaltyApplyPath:
        toOptionalString(process.env.MAXMA_LOYALTY_APPLY_PATH) ??
        '/checkout/loyalty/apply',
      checkoutCalculatePath:
        toOptionalString(process.env.MAXMA_CHECKOUT_CALCULATE_PATH) ??
        '/checkout/calculate',
      promoValidatePath:
        toOptionalString(process.env.MAXMA_PROMO_VALIDATE_PATH) ??
        '/checkout/promo-code/validate',
      giftCardValidatePath:
        toOptionalString(process.env.MAXMA_GIFT_CARD_VALIDATE_PATH) ??
        '/checkout/gift-card/validate',
      orderCreatePath:
        toOptionalString(process.env.MAXMA_ORDER_CREATE_PATH) ?? '/orders',
    },
    onec: {
      baseUrl: toOptionalString(process.env.ONEC_API_URL),
      login: toOptionalString(process.env.ONEC_API_LOGIN),
      password: toOptionalString(process.env.ONEC_API_PASSWORD),
      catalogSyncPath:
        toOptionalString(process.env.ONEC_CATALOG_SYNC_PATH) ?? '/catalog/sync',
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
});
