import CheckoutClient from './CheckoutClient';

type SearchParamsInput = Record<string, string | string[] | undefined>;

function readString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

function readNumber(value: string | string[] | undefined, fallback: number): number {
  const rawValue = readString(value).trim();

  if (!rawValue) {
    return fallback;
  }

  const raw = rawValue.replace(/\s/g, '').replace(',', '.');
  const parsed = Number(raw);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readItemString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function readItemNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(/\s/g, '').replace(',', '.'));

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function normalizeItem(value: unknown, index: number) {
  if (!isRecord(value)) {
    return null;
  }

  const price = readItemNumber(value.price) ?? 0;
  const quantity = Math.max(1, Math.trunc(readItemNumber(value.quantity) ?? 1));

  return {
    sku: readItemString(value.sku) ?? `item-${index + 1}`,
    title:
      readItemString(value.title) ?? readItemString(value.name) ?? `Товар ${index + 1}`,
    image:
      readItemString(value.image) ??
      readItemString(value.img) ??
      readItemString(value.photo),
    quantity,
    price: Math.max(0, price),
  };
}

function parseItems(value: string): Array<{
  sku: string;
  title?: string;
  quantity: number;
  price: number;
}> {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizeItem).filter(Boolean) as Array<{
      sku: string;
      title?: string;
      quantity: number;
      price: number;
    }>;
  } catch {
    return [];
  }
}

function buildInitialForm(searchParams: SearchParamsInput) {
  const cartItems = parseItems(readString(searchParams.cart));
  const paramItems = parseItems(readString(searchParams.items));
  const items = cartItems.length > 0 ? cartItems : paramItems;

  return {
    customer: {
      fullName: readString(searchParams.fullName) || readString(searchParams.name),
      phone: readString(searchParams.phone),
      email: readString(searchParams.email),
      address: readString(searchParams.address),
      city: readString(searchParams.city),
      street: readString(searchParams.street),
      house: readString(searchParams.house),
      apartment:
        readString(searchParams.apartment) || readString(searchParams.flat),
      intercom: readString(searchParams.intercom),
    },
    deliveryMethod: readString(searchParams.delivery) || 'courier',
    loyaltyCardNumber:
      readString(searchParams.loyaltyCardNumber) || readString(searchParams.card),
    promoCode: readString(searchParams.promoCode) || readString(searchParams.promo),
    giftCardNumber:
      readString(searchParams.giftCardNumber) ||
      readString(searchParams.giftCard) ||
      readString(searchParams.certificate),
    comment: readString(searchParams.comment),
    consentAccepted: true,
    items:
      items.length > 0
        ? items
        : [
            {
              sku: readString(searchParams.sku) || 'SKU-001',
              title: readString(searchParams.title) || 'Ваза Rose Royal',
              image: readString(searchParams.image) || undefined,
              quantity: Math.max(1, Math.trunc(readNumber(searchParams.quantity, 1))),
              price: Math.max(0, readNumber(searchParams.price, 3828000)),
            },
          ],
  };
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const resolvedSearchParams = await searchParams;

  return <CheckoutClient initialForm={buildInitialForm(resolvedSearchParams)} />;
}
