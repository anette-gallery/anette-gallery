import { getAppConfig, hasRealValue } from '@/server/config';
import type {
  CalculateCheckoutPayload,
  CreateOrderPayload,
  SyncCustomerPayload,
} from '@/types/api';

function isLiveEnabled(path: string | null): boolean {
  const config = getAppConfig();

  return (
    config.integrations.mode === 'live' &&
    hasRealValue(config.integrations.maxma.baseUrl) &&
    hasRealValue(config.integrations.maxma.apiKey) &&
    hasRealValue(path)
  );
}

function hasShopConfig(): boolean {
  const config = getAppConfig();

  return (
    hasRealValue(config.integrations.maxma.shopCode) &&
    hasRealValue(config.integrations.maxma.shopName)
  );
}

function buildUrl(path: string): string {
  const baseUrl = getAppConfig().integrations.maxma.baseUrl;
  return new URL(path, baseUrl ?? 'http://localhost').toString();
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s()-]/g, '');
}

function splitFullName(fullName: string) {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return {
    surname: parts[0],
    name: parts[1],
    patronymicName: parts[2],
  };
}

function buildShop() {
  const config = getAppConfig();

  if (!hasShopConfig()) {
    throw new Error(
      'Для live-интеграции Maxma нужно заполнить MAXMA_SHOP_CODE и MAXMA_SHOP_NAME',
    );
  }

  return {
    code: config.integrations.maxma.shopCode!,
    name: config.integrations.maxma.shopName!,
  };
}

function buildCompatibility(payload: CalculateCheckoutPayload) {
  const hasLoyalty = Boolean(payload.phone);
  const hasPromo = Boolean(payload.promoCode);
  const hasGiftCard = Boolean(payload.giftCardNumber);

  return {
    canCombineLoyaltyAndGiftCard: hasLoyalty && hasGiftCard,
    canCombinePromoAndGiftCard: hasPromo && hasGiftCard,
    hasAllThree: hasLoyalty && hasPromo && hasGiftCard,
    hasUnsupportedCombination: hasLoyalty && hasPromo,
    discountPriority: 'discount-then-gift-card',
    message: hasLoyalty && hasPromo
      ? 'Карта лояльности и промокод не суммируются'
      : 'Комбинация скидок допустима по текущим согласованным правилам',
  };
}

function buildCalculationQuery(payload: CalculateCheckoutPayload) {
  return {
    ...(payload.phone
      ? {
          client: {
            phoneNumber: normalizePhone(payload.phone),
          },
        }
      : {}),
    shop: buildShop(),
    rows: payload.items.map((item, index) => ({
      id: `${index + 1}`,
      product: {
        sku: item.sku,
        blackPrice: item.price,
      },
      qty: item.quantity,
    })),
    collectBonuses: 'auto',
    ...(payload.promoCode ? { promocode: payload.promoCode } : {}),
    ...(payload.giftCardNumber ? { giftCards: [payload.giftCardNumber] } : {}),
  };
}

function buildOrderCalculationQuery(payload: CreateOrderPayload) {
  return {
    ...(payload.customer.phone
      ? {
          client: {
            phoneNumber: normalizePhone(payload.customer.phone),
          },
        }
      : {}),
    shop: buildShop(),
    rows: payload.items.map((item, index) => ({
      id: `${index + 1}`,
      product: {
        sku: item.sku,
        blackPrice: item.unitPrice,
      },
      qty: item.quantity,
    })),
    collectBonuses: 'auto',
    ...(payload.promoCode ? { promocode: payload.promoCode } : {}),
    ...(payload.giftCardNumber ? { giftCards: [payload.giftCardNumber] } : {}),
  };
}

function buildSubtotal(payload: CalculateCheckoutPayload) {
  return payload.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function buildCheckoutFallback(
  payload: CalculateCheckoutPayload,
  action: string,
  reason: string,
  extra: Record<string, unknown> = {},
) {
  const subtotal = buildSubtotal(payload);

  return {
    status: 'error',
    mode: 'live',
    target: 'maxma',
    action,
    subtotal,
    total: subtotal,
    discounts: [],
    payload,
    compatibility: buildCompatibility(payload),
    loyalty: {
      phoneProvided: Boolean(payload.phone),
      suggestRegistration:
        Boolean(payload.phone) && !payload.registerInLoyaltyProgram,
      registrationChannel: 'telegram-bot',
      allowRegistrationDecline: true,
    },
    fallbackPolicy: {
      allowCheckoutWithoutDiscounts: true,
      reason,
    },
    display: {
      showBeforeAndAfterTotals: true,
      showDiscountBreakdown: true,
    },
    ...extra,
  };
}

async function post(
  path: string | null,
  action: string,
  payload: unknown,
  { requiresShop = false }: { requiresShop?: boolean } = {},
) {
  if (!isLiveEnabled(path)) {
    return {
      status: 'stub',
      mode: 'stub',
      target: 'maxma',
      action,
      payload,
    };
  }

  if (requiresShop) {
    buildShop();
  }

  const config = getAppConfig();
  const url = buildUrl(path ?? '/');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'ru',
      'Content-Type': 'application/json',
      'X-Processing-Key': config.integrations.maxma.apiKey!,
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const responseText = await response.text();
  let responseBody: unknown = responseText;

  if (responseText) {
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = responseText;
    }
  }

  const responseStatus =
    response.ok &&
    typeof responseBody === 'object' &&
    responseBody !== null &&
    'errorCode' in responseBody
      ? 'error'
      : response.ok
        ? 'ok'
        : 'error';

  return {
    status: responseStatus,
    mode: 'live',
    target: 'maxma',
    action,
    responseStatusCode: response.status,
    url,
    responseBody,
    payload,
  };
}

export function syncCustomer(payload: SyncCustomerPayload) {
  const { surname, name, patronymicName } = splitFullName(payload.fullName);

  return post(
    getAppConfig().integrations.maxma.customerSyncPath,
    'sync-customer',
    {
      phoneNumber: normalizePhone(payload.phone),
      client: {
        fullName: payload.fullName,
        ...(payload.email ? { email: payload.email } : {}),
        ...(payload.loyaltyCardNumber ? { card: payload.loyaltyCardNumber } : {}),
        ...(surname ? { surname } : {}),
        ...(name ? { name } : {}),
        ...(patronymicName ? { patronymicName } : {}),
        ...(payload.address
          ? {
              extraFields: {
                address: payload.address,
              },
            }
          : {}),
      },
    },
  );
}

export function applyLoyalty(payload: CalculateCheckoutPayload) {
  return calculateAction(
    getAppConfig().integrations.maxma.loyaltyApplyPath,
    'apply-loyalty',
    payload,
  );
}

export function validatePromoCode(payload: CalculateCheckoutPayload) {
  return calculateAction(
    getAppConfig().integrations.maxma.promoValidatePath,
    'validate-promo-code',
    payload,
  );
}

export function validateGiftCard(payload: CalculateCheckoutPayload) {
  return calculateAction(
    getAppConfig().integrations.maxma.giftCardValidatePath,
    'validate-gift-card',
    payload,
  );
}

async function calculateAction(
  path: string | null,
  action: string,
  payload: CalculateCheckoutPayload,
) {
  const compatibility = buildCompatibility(payload);
  const subtotal = buildSubtotal(payload);

  if (!isLiveEnabled(path)) {
    const shouldSuggestRegistration =
      Boolean(payload.phone) && !payload.registerInLoyaltyProgram;

    return {
      status: 'stub',
      mode: 'stub',
      target: 'maxma',
      action,
      subtotal,
      total: subtotal,
      discounts: [],
      loyalty: {
        phoneFound: false,
        suggestRegistration: shouldSuggestRegistration,
        registrationChannel: shouldSuggestRegistration ? 'telegram-bot' : null,
        allowRegistrationDecline: true,
      },
      compatibility: {
        ...compatibility,
      },
      fallbackPolicy: {
        allowCheckoutWithoutDiscounts: true,
        reason:
          'Если Maxma недоступна, оформление заказа должно продолжаться без скидок',
      },
      display: {
        showBeforeAndAfterTotals: true,
        showDiscountBreakdown: true,
      },
      payload,
    };
  }

  try {
    const result = await post(
      path,
      action,
      {
        calculationQuery: buildCalculationQuery(payload),
      },
      { requiresShop: true },
    );

    if (result.status !== 'ok') {
      return buildCheckoutFallback(
        payload,
        action,
        'Maxma вернула ошибку, поэтому checkout остается без скидок',
        result,
      );
    }

    const responseBody =
      typeof result.responseBody === 'object' && result.responseBody !== null
        ? (result.responseBody as Record<string, unknown>)
        : {};
    const calculationResult =
      typeof responseBody.calculationResult === 'object' &&
      responseBody.calculationResult !== null
        ? (responseBody.calculationResult as Record<string, unknown>)
        : {};
    const summary =
      typeof calculationResult.summary === 'object' &&
      calculationResult.summary !== null
        ? (calculationResult.summary as Record<string, unknown>)
        : {};
    const bonuses =
      typeof calculationResult.bonuses === 'object' &&
      calculationResult.bonuses !== null
        ? (calculationResult.bonuses as Record<string, unknown>)
        : undefined;
    const promocode =
      typeof calculationResult.promocode === 'object' &&
      calculationResult.promocode !== null
        ? (calculationResult.promocode as Record<string, unknown>)
        : undefined;
    const giftCards = Array.isArray(calculationResult.giftCards)
      ? calculationResult.giftCards
      : [];

    const totalDiscount =
      typeof summary.totalDiscount === 'number' ? summary.totalDiscount : 0;
    const prepaidAmount =
      typeof summary.prepaidAmount === 'number' ? summary.prepaidAmount : 0;
    const total = Math.max(0, subtotal - totalDiscount - prepaidAmount);

    return {
      status: 'ok',
      mode: 'live',
      target: 'maxma',
      action,
      subtotal,
      total,
      discounts: [
        {
          kind: 'summary',
          ...(typeof summary.discounts === 'object' && summary.discounts !== null
            ? (summary.discounts as Record<string, unknown>)
            : {}),
          totalDiscount,
          prepaidAmount,
        },
      ],
      payload,
      compatibility,
      loyalty: {
        phoneProvided: Boolean(payload.phone),
        suggestRegistration: false,
        registrationChannel: 'telegram-bot',
        allowRegistrationDecline: true,
        bonuses,
      },
      fallbackPolicy: {
        allowCheckoutWithoutDiscounts: true,
        reason:
          'Если Maxma недоступна, оформление заказа продолжается без скидок',
      },
      display: {
        showBeforeAndAfterTotals: true,
        showDiscountBreakdown: true,
      },
      promocode,
      giftCards,
      rawResponse: responseBody,
    };
  } catch (error) {
    return buildCheckoutFallback(
      payload,
      action,
      error instanceof Error ? error.message : 'Не удалось выполнить запрос в Maxma',
    );
  }
}

export function calculateCheckout(payload: CalculateCheckoutPayload) {
  return calculateAction(
    getAppConfig().integrations.maxma.checkoutCalculatePath,
    'calculate-checkout',
    payload,
  );
}

export function createOrder(payload: CreateOrderPayload) {
  return post(
    getAppConfig().integrations.maxma.orderCreatePath,
    'create-order',
    {
      txid: `lapaloma-${Date.now()}`,
      calculationQuery: buildOrderCalculationQuery(payload),
    },
    { requiresShop: true },
  );
}
