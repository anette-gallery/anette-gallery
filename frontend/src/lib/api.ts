export type CheckoutItemInput = {
  sku: string;
  quantity: number;
  price: number;
};

export type CalculateCheckoutPayload = {
  phone?: string;
  promoCode?: string;
  giftCardNumber?: string;
  items: CheckoutItemInput[];
};

export type CheckoutCalculationResponse = {
  status: string;
  target: string;
  action: string;
  subtotal: number;
  total: number;
  discounts: unknown[];
  payload: CalculateCheckoutPayload;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1';

async function apiRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });

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
