import type {
  CalculateCheckoutPayload,
  CheckoutCalculationResponse,
} from '@/types/api';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || '/api/v1';

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
