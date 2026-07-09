import type {
  CalculateCheckoutPayload,
  CreateOrderPayload,
  OrderCustomer,
  OrderItem,
  SyncCatalogBatchPayload,
  SyncCatalogItemPayload,
  SyncCustomerPayload,
} from '@/types/api';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPhone(value: string): boolean {
  const normalized = value.replace(/[\s()-]/g, '');
  return /^\+?\d{10,15}$/.test(normalized);
}

function expectString(
  value: unknown,
  field: string,
  { maxLength, optional = false }: { maxLength?: number; optional?: boolean } = {},
): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (optional) {
      return undefined;
    }

    throw new Error(`Поле "${field}" обязательно`);
  }

  if (typeof value !== 'string') {
    throw new Error(`Поле "${field}" должно быть строкой`);
  }

  const trimmed = value.trim();

  if (!trimmed && !optional) {
    throw new Error(`Поле "${field}" обязательно`);
  }

  if (maxLength && trimmed.length > maxLength) {
    throw new Error(
      `Поле "${field}" превышает ограничение ${maxLength} символов`,
    );
  }

  return trimmed || undefined;
}

function expectNumber(
  value: unknown,
  field: string,
  {
    min,
    optional = false,
    integer = false,
  }: { min?: number; optional?: boolean; integer?: boolean } = {},
): number | undefined {
  if (value === undefined || value === null || value === '') {
    if (optional) {
      return undefined;
    }

    throw new Error(`Поле "${field}" обязательно`);
  }

  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Поле "${field}" должно быть числом`);
  }

  if (integer && !Number.isInteger(parsed)) {
    throw new Error(`Поле "${field}" должно быть целым числом`);
  }

  if (min !== undefined && parsed < min) {
    throw new Error(`Поле "${field}" должно быть не меньше ${min}`);
  }

  return parsed;
}

function expectBoolean(
  value: unknown,
  field: string,
  optional = false,
): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    if (optional) {
      return undefined;
    }

    throw new Error(`Поле "${field}" обязательно`);
  }

  if (typeof value !== 'boolean') {
    throw new Error(`Поле "${field}" должно быть булевым`);
  }

  return value;
}

function expectStringArray(
  value: unknown,
  field: string,
  optional = false,
): string[] | undefined {
  if (value === undefined || value === null) {
    if (optional) {
      return undefined;
    }

    throw new Error(`Поле "${field}" обязательно`);
  }

  if (!Array.isArray(value)) {
    throw new Error(`Поле "${field}" должно быть массивом`);
  }

  return value.map((item, index) => {
    if (typeof item !== 'string' || !item.trim()) {
      throw new Error(
        `Элемент ${index + 1} в "${field}" должен быть непустой строкой`,
      );
    }

    return item.trim();
  });
}

function expectIsoDate(
  value: unknown,
  field: string,
  optional = false,
): string | undefined {
  const dateString = expectString(value, field, { optional, maxLength: 64 });

  if (!dateString) {
    return undefined;
  }

  if (Number.isNaN(Date.parse(dateString))) {
    throw new Error(`Поле "${field}" должно быть корректной ISO датой`);
  }

  return dateString;
}

function parseCheckoutItem(value: unknown, index: number) {
  if (!isRecord(value)) {
    throw new Error(`Товар #${index + 1} должен быть объектом`);
  }

  return {
    sku: expectString(value.sku, `items[${index}].sku`, { maxLength: 64 })!,
    quantity: expectNumber(value.quantity, `items[${index}].quantity`, {
      min: 1,
      integer: true,
    })!,
    price: expectNumber(value.price, `items[${index}].price`, {
      min: 0,
    })!,
  };
}

export function parseCalculateCheckoutPayload(
  input: unknown,
): CalculateCheckoutPayload {
  if (!isRecord(input)) {
    throw new Error('Тело запроса должно быть объектом');
  }

  const phone = expectString(input.phone, 'phone', {
    optional: true,
    maxLength: 32,
  });

  if (phone && !isPhone(phone)) {
    throw new Error('Поле "phone" должно быть корректным номером телефона');
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error('Поле "items" должно содержать хотя бы один товар');
  }

  return {
    phone,
    promoCode: expectString(input.promoCode, 'promoCode', {
      optional: true,
      maxLength: 64,
    }),
    giftCardNumber: expectString(input.giftCardNumber, 'giftCardNumber', {
      optional: true,
      maxLength: 64,
    }),
    registerInLoyaltyProgram: expectBoolean(
      input.registerInLoyaltyProgram,
      'registerInLoyaltyProgram',
      true,
    ),
    items: input.items.map(parseCheckoutItem),
  };
}

export function parseSyncCustomerPayload(input: unknown): SyncCustomerPayload {
  if (!isRecord(input)) {
    throw new Error('Тело запроса должно быть объектом');
  }

  const phone = expectString(input.phone, 'phone', { maxLength: 32 })!;

  if (!isPhone(phone)) {
    throw new Error('Поле "phone" должно быть корректным номером телефона');
  }

  return {
    fullName: expectString(input.fullName, 'fullName', { maxLength: 255 })!,
    phone,
    email: expectString(input.email, 'email', {
      optional: true,
      maxLength: 255,
    }),
    loyaltyCardNumber: expectString(input.loyaltyCardNumber, 'loyaltyCardNumber', {
      optional: true,
      maxLength: 64,
    }),
    address: expectString(input.address, 'address', {
      optional: true,
      maxLength: 500,
    }),
  };
}

function parseOrderCustomer(value: unknown): OrderCustomer {
  if (!isRecord(value)) {
    throw new Error('Поле "customer" должно быть объектом');
  }

  const phone = expectString(value.phone, 'customer.phone', {
    maxLength: 32,
  })!;

  if (!isPhone(phone)) {
    throw new Error(
      'Поле "customer.phone" должно быть корректным номером телефона',
    );
  }

  return {
    fullName: expectString(value.fullName, 'customer.fullName', {
      maxLength: 255,
    })!,
    phone,
    email: expectString(value.email, 'customer.email', {
      optional: true,
      maxLength: 255,
    }),
  };
}

function parseOrderItem(value: unknown, index: number): OrderItem {
  if (!isRecord(value)) {
    throw new Error(`Товар заказа #${index + 1} должен быть объектом`);
  }

  return {
    sku: expectString(value.sku, `items[${index}].sku`, { maxLength: 64 })!,
    quantity: expectNumber(value.quantity, `items[${index}].quantity`, {
      min: 1,
      integer: true,
    })!,
    unitPrice: expectNumber(value.unitPrice, `items[${index}].unitPrice`, {
      min: 0,
    })!,
  };
}

export function parseCreateOrderPayload(input: unknown): CreateOrderPayload {
  if (!isRecord(input)) {
    throw new Error('Тело запроса должно быть объектом');
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error('Поле "items" должно содержать хотя бы один товар');
  }

  return {
    customer: parseOrderCustomer(input.customer),
    items: input.items.map(parseOrderItem),
    totalAmount: expectNumber(input.totalAmount, 'totalAmount', { min: 0 })!,
    promoCode: expectString(input.promoCode, 'promoCode', {
      optional: true,
      maxLength: 64,
    }),
    giftCardNumber: expectString(input.giftCardNumber, 'giftCardNumber', {
      optional: true,
      maxLength: 64,
    }),
    loyaltyCardNumber: expectString(input.loyaltyCardNumber, 'loyaltyCardNumber', {
      optional: true,
      maxLength: 64,
    }),
  };
}

export function parseSyncCatalogItemPayload(
  input: unknown,
): SyncCatalogItemPayload {
  if (!isRecord(input)) {
    throw new Error('Тело запроса должно быть объектом');
  }

  return {
    sku: expectString(input.sku, 'sku', { maxLength: 64 })!,
    title: expectString(input.title, 'title', { maxLength: 255 })!,
    description: expectString(input.description, 'description', {
      optional: true,
      maxLength: 5000,
    }),
    brand: expectString(input.brand, 'brand', {
      optional: true,
      maxLength: 255,
    }),
    color: expectString(input.color, 'color', {
      optional: true,
      maxLength: 64,
    }),
    size: expectString(input.size, 'size', {
      optional: true,
      maxLength: 64,
    }),
    weight: expectNumber(input.weight, 'weight', { optional: true, min: 0 }),
    dimensions: expectString(input.dimensions, 'dimensions', {
      optional: true,
      maxLength: 128,
    }),
    images: expectStringArray(input.images, 'images', true),
    manualOverrideFields: expectStringArray(
      input.manualOverrideFields,
      'manualOverrideFields',
      true,
    ),
    preserveTildaOverrides: expectBoolean(
      input.preserveTildaOverrides,
      'preserveTildaOverrides',
      true,
    ),
    missingInOneC: expectBoolean(input.missingInOneC, 'missingInOneC', true),
    sourceUpdatedAt: expectIsoDate(
      input.sourceUpdatedAt,
      'sourceUpdatedAt',
      true,
    ),
    tildaUpdatedAt: expectIsoDate(
      input.tildaUpdatedAt,
      'tildaUpdatedAt',
      true,
    ),
  };
}

export function parseSyncCatalogBatchPayload(
  input: unknown,
): SyncCatalogBatchPayload {
  if (!isRecord(input)) {
    throw new Error('Тело запроса должно быть объектом');
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error('Поле "items" должно содержать хотя бы один товар');
  }

  return {
    items: input.items.map(parseSyncCatalogItemPayload),
  };
}
