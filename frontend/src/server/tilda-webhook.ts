import { parseCreateOrderPayload } from '@/server/validation';
import type { CreateOrderPayload, OrderItem } from '@/types/api';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9а-яё]/gi, '');
}

function buildLookup(record: Record<string, unknown>) {
  const lookup = new Map<string, unknown>();

  for (const [key, value] of Object.entries(record)) {
    lookup.set(normalizeKey(key), value);
  }

  return lookup;
}

function getValue(
  lookup: Map<string, unknown>,
  aliases: string[],
): unknown | undefined {
  for (const alias of aliases) {
    const match = lookup.get(normalizeKey(alias));

    if (match !== undefined && match !== null && match !== '') {
      return match;
    }
  }

  return undefined;
}

function getStringValue(
  lookup: Map<string, unknown>,
  aliases: string[],
): string | undefined {
  const value = getValue(lookup, aliases);

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return undefined;
}

function getNumberValue(
  lookup: Map<string, unknown>,
  aliases: string[],
): number | undefined {
  const value = getValue(lookup, aliases);

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
    const parsed = Number(normalized);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function parseJsonString(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toObjectArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  if (typeof value === 'string') {
    const parsed = parseJsonString(value);
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  }

  return [];
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(/\s/g, '').replace(',', '.'));

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function normalizeOrderItem(
  value: Record<string, unknown>,
  index: number,
): OrderItem {
  const lookup = buildLookup(value);
  const title =
    getStringValue(lookup, ['title', 'name', 'product', 'товар', 'наименование']) ??
    `Tilda item ${index + 1}`;
  const sku =
    getStringValue(lookup, [
      'sku',
      'article',
      'articul',
      'vendorcode',
      'externalid',
      'external_id',
      'offerid',
      'variantid',
      'id',
    ]) ?? `tilda-item-${index + 1}`;
  const quantity = Math.max(
    1,
    Math.trunc(
      toNumber(
        getValue(lookup, ['quantity', 'qty', 'count', 'amount', 'количество']),
        1,
      ),
    ),
  );
  const unitPrice = Math.max(
    0,
    toNumber(
      getValue(lookup, ['unitprice', 'price', 'cost', 'sum', 'amount', 'цена']),
      0,
    ),
  );

  return {
    sku: sku || title,
    quantity,
    unitPrice,
  };
}

function extractItems(record: Record<string, unknown>): OrderItem[] {
  const lookup = buildLookup(record);
  const candidates = [
    getValue(lookup, ['items', 'products', 'goods', 'orderitems', 'товары']),
    record.items,
    record.products,
  ];

  for (const candidate of candidates) {
    const parsedItems = toObjectArray(candidate)
      .map(normalizeOrderItem)
      .filter((item) => item.quantity > 0);

    if (parsedItems.length > 0) {
      return parsedItems;
    }
  }

  return [];
}

export function parseTildaOrderPayload(input: unknown): CreateOrderPayload {
  if (!isRecord(input)) {
    throw new Error('Webhook Tilda должен передавать объект в теле запроса');
  }

  const lookup = buildLookup(input);
  const items = extractItems(input);
  const totalAmount =
    getNumberValue(lookup, [
      'totalAmount',
      'total',
      'amount',
      'sum',
      'summ',
      'итого',
      'сумма',
      'sumtotal',
    ]) ??
    items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  return parseCreateOrderPayload({
    customer: {
      fullName:
        getStringValue(lookup, ['fullName', 'fio', 'name', 'фио', 'имя']) ??
        'Покупатель с Tilda',
      phone: getStringValue(lookup, [
        'phone',
        'telephone',
        'telefon',
        'tel',
        'mobile',
        'телефон',
      ]),
      email: getStringValue(lookup, ['email', 'mail', 'e-mail', 'почта']),
    },
    items,
    totalAmount,
    promoCode: getStringValue(lookup, ['promoCode', 'promo', 'promocode', 'промокод']),
    giftCardNumber: getStringValue(lookup, [
      'giftCardNumber',
      'giftCard',
      'certificate',
      'сертификат',
    ]),
    loyaltyCardNumber: getStringValue(lookup, [
      'loyaltyCardNumber',
      'loyaltyCard',
      'cardNumber',
      'карта',
    ]),
  });
}
