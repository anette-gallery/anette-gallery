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

function buildUrl(path: string): string {
  const baseUrl = getAppConfig().integrations.maxma.baseUrl;
  return new URL(path, baseUrl ?? 'http://localhost').toString();
}

async function post(path: string | null, action: string, payload: unknown) {
  if (!isLiveEnabled(path)) {
    return {
      status: 'stub',
      mode: 'stub',
      target: 'maxma',
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
      Authorization: `Bearer ${config.integrations.maxma.apiKey}`,
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const body = await response.text();

  return {
    status: response.ok ? 'ok' : 'error',
    mode: 'live',
    target: 'maxma',
    action,
    responseStatus: response.status,
    url,
    responseBody: body,
    payload,
  };
}

export function syncCustomer(payload: SyncCustomerPayload) {
  return post(
    getAppConfig().integrations.maxma.customerSyncPath,
    'sync-customer',
    payload,
  );
}

export function applyLoyalty(payload: CalculateCheckoutPayload) {
  return post(
    getAppConfig().integrations.maxma.loyaltyApplyPath,
    'apply-loyalty',
    payload,
  );
}

export function validatePromoCode(payload: CalculateCheckoutPayload) {
  return post(
    getAppConfig().integrations.maxma.promoValidatePath,
    'validate-promo-code',
    payload,
  );
}

export function validateGiftCard(payload: CalculateCheckoutPayload) {
  return post(
    getAppConfig().integrations.maxma.giftCardValidatePath,
    'validate-gift-card',
    payload,
  );
}

export function calculateCheckout(payload: CalculateCheckoutPayload) {
  const subtotal = payload.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const hasLoyalty = Boolean(payload.phone);
  const hasPromo = Boolean(payload.promoCode);
  const hasGiftCard = Boolean(payload.giftCardNumber);
  const canCombineLoyaltyAndGiftCard = hasLoyalty && hasGiftCard;
  const canCombinePromoAndGiftCard = hasPromo && hasGiftCard;
  const hasAllThree = hasLoyalty && hasPromo && hasGiftCard;
  const hasUnsupportedCombination = hasLoyalty && hasPromo;
  const path = getAppConfig().integrations.maxma.checkoutCalculatePath;

  if (!isLiveEnabled(path)) {
    const shouldSuggestRegistration =
      Boolean(payload.phone) && !payload.registerInLoyaltyProgram;

    return Promise.resolve({
      status: 'stub',
      mode: 'stub',
      target: 'maxma',
      action: 'calculate-checkout',
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
        canCombineLoyaltyAndGiftCard,
        canCombinePromoAndGiftCard,
        hasAllThree,
        hasUnsupportedCombination,
        discountPriority: 'discount-then-gift-card',
        message: hasUnsupportedCombination
          ? 'Карта лояльности и промокод не суммируются'
          : 'Комбинация скидок допустима по текущим согласованным правилам',
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
    });
  }

  return post(path, 'calculate-checkout', payload);
}

export function createOrder(payload: CreateOrderPayload) {
  return post(
    getAppConfig().integrations.maxma.orderCreatePath,
    'create-order',
    payload,
  );
}
