export type IntegrationMode = 'stub' | 'live';

export type CheckoutItemInput = {
  sku: string;
  quantity: number;
  price: number;
};

export type CalculateCheckoutPayload = {
  phone?: string;
  promoCode?: string;
  giftCardNumber?: string;
  registerInLoyaltyProgram?: boolean;
  items: CheckoutItemInput[];
};

export type CheckoutCalculationResponse = {
  status: string;
  mode: IntegrationMode;
  target: string;
  action: string;
  subtotal: number;
  total: number;
  discounts: unknown[];
  payload: CalculateCheckoutPayload;
  compatibility?: Record<string, unknown>;
  loyalty?: Record<string, unknown>;
  fallbackPolicy?: Record<string, unknown>;
  display?: Record<string, unknown>;
};

export type SyncCustomerPayload = {
  fullName: string;
  phone: string;
  email?: string;
  loyaltyCardNumber?: string;
  address?: string;
};

export type OrderCustomer = {
  fullName: string;
  phone: string;
  email?: string;
};

export type OrderItem = {
  sku: string;
  quantity: number;
  unitPrice: number;
};

export type CreateOrderPayload = {
  customer: OrderCustomer;
  items: OrderItem[];
  totalAmount: number;
  promoCode?: string;
  giftCardNumber?: string;
  loyaltyCardNumber?: string;
};

export type SyncCatalogItemPayload = {
  sku: string;
  title: string;
  description?: string;
  brand?: string;
  color?: string;
  size?: string;
  weight?: number;
  dimensions?: string;
  images?: string[];
  manualOverrideFields?: string[];
  preserveTildaOverrides?: boolean;
  missingInOneC?: boolean;
  sourceUpdatedAt?: string;
  tildaUpdatedAt?: string;
};

export type SyncCatalogBatchPayload = {
  items: SyncCatalogItemPayload[];
};
