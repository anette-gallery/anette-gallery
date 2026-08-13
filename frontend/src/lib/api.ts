import type {
  CalculateCheckoutPayload,
  CheckoutCalculationResponse,
  CreateOrderPayload,
  CreatePaymentPayload,
  CreatePaymentResponse,
} from '@/types/api';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || '/api/v1';
const API_REQUEST_TIMEOUT_MS = 15000;

async function apiRequest<T>(path: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, API_REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    window.clearTimeout(timeoutId);
    throw error;
  }

  window.clearTimeout(timeoutId);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `API request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export function calculateCheckout(payload: CalculateCheckoutPayload) {
  return apiRequest<CheckoutCalculationResponse>('/checkout/calculate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function validatePromoCode(payload: CalculateCheckoutPayload) {
  return apiRequest<CheckoutCalculationResponse>('/checkout/promo-code/validate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function validateGiftCard(payload: CalculateCheckoutPayload) {
  return apiRequest<CheckoutCalculationResponse>('/checkout/gift-card/validate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createOrder(payload: CreateOrderPayload) {
  return apiRequest<Record<string, unknown>>('/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createPaykeeperPayment(payload: CreatePaymentPayload) {
  return apiRequest<CreatePaymentResponse>('/payments/paykeeper/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
