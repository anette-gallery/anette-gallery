'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { calculateCheckout, createOrder } from '@/lib/api';
import type {
  CalculateCheckoutPayload,
  CheckoutCalculationResponse,
  CheckoutItemInput,
  CreateOrderPayload,
} from '@/types/api';
import styles from './page.module.css';

const EXIT_URL = 'https://anette-gallery.tilda.ws';

const DELIVERY_OPTIONS = [
  {
    value: 'courier',
    label: 'Доставка курьером по Москве',
    hint: 'от 3 дней',
    summary: 'Доставка курьером по Москве',
  },
  {
    value: 'pickup',
    label: 'Самовывоз из галереи в Москве',
    hint: 'от 1 дня',
    summary: 'Самовывоз из галереи в Москве',
  },
  {
    value: 'cdek',
    label: 'Доставка СДЭК / служба доставки',
    hint: 'по тарифу перевозчика',
    summary: 'Доставка службой доставки',
  },
];

const PICKUP_DETAILS = {
  lead: 'Время работы с 11 до 21 ежедневно',
  title: 'Пункт получения:',
  name: 'Самовывоз из галереи в Москве',
  address: 'Адрес: Москва, Большая Бронная, 10с1',
  hours: 'Время работы: Ежедневно с 11 до 21',
  phones: 'Телефоны: +7 (495) 222-18-91, +7 (985) 222-18-91',
};

const CHECKOUT_PROFILE_KEY = 'lapaloma_checkout_profile_v1';

export type CheckoutFormState = {
  customer: {
    fullName: string;
    phone: string;
    email: string;
    address: string;
    city: string;
    street: string;
    house: string;
    apartment: string;
    intercom: string;
  };
  deliveryMethod: string;
  loyaltyCardNumber: string;
  promoCode: string;
  giftCardNumber: string;
  comment: string;
  consentAccepted: boolean;
  items: CheckoutItemInput[];
};

const currencyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function formatCurrency(value: number) {
  return currencyFormatter.format(value).replace(/\s/g, ' ');
}

function getDeliveryOption(value: string) {
  return (
    DELIVERY_OPTIONS.find((option) => option.value === value) ?? DELIVERY_OPTIONS[0]
  );
}

function isCustomerProfile(value: unknown): value is CheckoutFormState['customer'] {
  return isRecord(value);
}

function readStoredProfile(): Partial<CheckoutFormState> | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(CHECKOUT_PROFILE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue);

    if (!isRecord(parsed)) {
      return null;
    }

    return {
      customer: isCustomerProfile(parsed.customer)
        ? {
            fullName: readString(parsed.customer.fullName) ?? '',
            phone: readString(parsed.customer.phone) ?? '',
            email: readString(parsed.customer.email) ?? '',
            address: readString(parsed.customer.address) ?? '',
            city: readString(parsed.customer.city) ?? '',
            street: readString(parsed.customer.street) ?? '',
            house: readString(parsed.customer.house) ?? '',
            apartment: readString(parsed.customer.apartment) ?? '',
            intercom: readString(parsed.customer.intercom) ?? '',
          }
        : undefined,
      deliveryMethod: readString(parsed.deliveryMethod),
      loyaltyCardNumber: readString(parsed.loyaltyCardNumber),
    };
  } catch {
    return null;
  }
}

function mergeStoredProfile(
  form: CheckoutFormState,
  storedProfile: Partial<CheckoutFormState> | null,
): CheckoutFormState {
  if (!storedProfile) {
    return form;
  }

  const storedCustomer = storedProfile.customer;

  return {
    ...form,
    customer: {
      fullName: form.customer.fullName || storedCustomer?.fullName || '',
      phone: form.customer.phone || storedCustomer?.phone || '',
      email: form.customer.email || storedCustomer?.email || '',
      address: form.customer.address || storedCustomer?.address || '',
      city: form.customer.city || storedCustomer?.city || '',
      street: form.customer.street || storedCustomer?.street || '',
      house: form.customer.house || storedCustomer?.house || '',
      apartment: form.customer.apartment || storedCustomer?.apartment || '',
      intercom: form.customer.intercom || storedCustomer?.intercom || '',
    },
    deliveryMethod:
      form.deliveryMethod !== DELIVERY_OPTIONS[0].value
        ? form.deliveryMethod
        : storedProfile.deliveryMethod || form.deliveryMethod,
    loyaltyCardNumber: form.loyaltyCardNumber || storedProfile.loyaltyCardNumber || '',
  };
}

function buildStoredProfile(form: CheckoutFormState) {
  return {
    customer: {
      ...form.customer,
    },
    deliveryMethod: form.deliveryMethod,
    loyaltyCardNumber: form.loyaltyCardNumber.trim(),
  };
}

function buildAddress(customer: CheckoutFormState['customer']) {
  const structuredParts = [
    customer.city,
    customer.street,
    customer.house ? `дом ${customer.house}` : '',
    customer.apartment ? `кв./офис ${customer.apartment}` : '',
    customer.intercom ? `домофон ${customer.intercom}` : '',
  ]
    .map((part) => part.trim())
    .filter(Boolean);

  if (structuredParts.length > 0) {
    return structuredParts.join(', ');
  }

  return customer.address.trim() || undefined;
}

function buildOrderComment(form: CheckoutFormState) {
  const commentParts = [form.comment.trim()];

  if (form.loyaltyCardNumber.trim()) {
    commentParts.push(`Карта лояльности: ${form.loyaltyCardNumber.trim()}`);
  }

  return commentParts.filter(Boolean).join('. ') || undefined;
}

function buildCalculationPayload(form: CheckoutFormState): CalculateCheckoutPayload {
  return {
    phone: form.customer.phone.trim() || undefined,
    promoCode: form.promoCode.trim() || undefined,
    giftCardNumber: form.giftCardNumber.trim() || undefined,
    items: form.items.map((item) => ({
      sku: item.sku.trim(),
      title: item.title?.trim() || undefined,
      image: item.image?.trim() || undefined,
      quantity: Math.max(1, Math.trunc(item.quantity || 1)),
      price: Math.max(0, Number(item.price || 0)),
    })),
  };
}

function buildOrderPayload(
  form: CheckoutFormState,
  totalAmount: number,
): CreateOrderPayload {
  return {
    customer: {
      fullName: form.customer.fullName.trim(),
      phone: form.customer.phone.trim(),
      email: form.customer.email.trim() || undefined,
      address: buildAddress(form.customer),
    },
    deliveryMethod: getDeliveryOption(form.deliveryMethod).summary,
    loyaltyCardNumber: form.loyaltyCardNumber.trim() || undefined,
    promoCode: form.promoCode.trim() || undefined,
    giftCardNumber: form.giftCardNumber.trim() || undefined,
    comment: buildOrderComment(form),
    totalAmount,
    items: form.items.map((item) => ({
      sku: item.sku.trim(),
      title: item.title?.trim() || undefined,
      image: item.image?.trim() || undefined,
      quantity: Math.max(1, Math.trunc(item.quantity || 1)),
      unitPrice: Math.max(0, Number(item.price || 0)),
    })),
  };
}

function getCompatibilityMessage(result: CheckoutCalculationResponse | null) {
  const message = result?.compatibility?.message;
  return typeof message === 'string' ? message : null;
}

function getPromocodeLabel(result: CheckoutCalculationResponse | null) {
  const promocode = result?.promocode;

  if (!isRecord(promocode)) {
    return null;
  }

  const name = readString(promocode.name) ?? readString(promocode.code);
  const value = readString(promocode.description);

  return [name, value].filter(Boolean).join(' - ') || null;
}

function getDiscountBreakdown(result: CheckoutCalculationResponse | null) {
  const firstDiscount =
    Array.isArray(result?.discounts) && result?.discounts.length > 0
      ? result.discounts[0]
      : null;

  if (!isRecord(firstDiscount)) {
    return {
      totalDiscount: 0,
      prepaidAmount: 0,
    };
  }

  return {
    totalDiscount:
      typeof firstDiscount.totalDiscount === 'number' ? firstDiscount.totalDiscount : 0,
    prepaidAmount:
      typeof firstDiscount.prepaidAmount === 'number' ? firstDiscount.prepaidAmount : 0,
  };
}

function getCalculationStatusMessage(
  result: CheckoutCalculationResponse | null,
  subtotal: number,
) {
  if (!result) {
    return null;
  }

  const { totalDiscount, prepaidAmount } = getDiscountBreakdown(result);
  const discountAmount = Math.max(0, subtotal - result.total);
  const hasPromo = Boolean(getPromocodeLabel(result));
  const hasGiftCards = Array.isArray(result.giftCards) && result.giftCards.length > 0;
  const hasDiscounts = totalDiscount > 0 || prepaidAmount > 0;

  if (discountAmount > 0) {
    return `Скидка применена. Экономия ${formatCurrency(discountAmount)}, итоговая сумма ${formatCurrency(result.total)}.`;
  }

  if (hasPromo || hasGiftCards || hasDiscounts) {
    return `Проверка выполнена. Итоговая сумма: ${formatCurrency(result.total)}.`;
  }

  return `Скидка не найдена. MAXMA вернула 0 ₽ скидки и 0 ₽ бонусов, итоговая сумма без изменений: ${formatCurrency(result.total)}.`;
}

type CheckoutClientProps = {
  initialForm: CheckoutFormState;
};

export default function CheckoutClient({ initialForm }: CheckoutClientProps) {
  const [form, setForm] = useState<CheckoutFormState>(() =>
    mergeStoredProfile(initialForm, readStoredProfile()),
  );
  const [calculation, setCalculation] = useState<CheckoutCalculationResponse | null>(null);
  const [orderResponse, setOrderResponse] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastCalculatedKey, setLastCalculatedKey] = useState<string>('');

  const calculationPayload = useMemo(() => buildCalculationPayload(form), [form]);
  const calculationKey = useMemo(
    () => JSON.stringify(calculationPayload),
    [calculationPayload],
  );
  const subtotal = useMemo(
    () =>
      form.items.reduce(
        (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
        0,
      ),
    [form.items],
  );
  const hasStaleCalculation = Boolean(calculation) && lastCalculatedKey !== calculationKey;
  const total =
    hasStaleCalculation || !calculation ? subtotal : calculation.total;
  const orderStatus =
    typeof orderResponse?.status === 'string' ? orderResponse.status : null;
  const deliveryOption = getDeliveryOption(form.deliveryMethod);
  const addressSummary =
    buildAddress(form.customer) ?? 'Россия, Москва';
  const storedProfileJson = useMemo(() => JSON.stringify(buildStoredProfile(form)), [form]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(CHECKOUT_PROFILE_KEY, storedProfileJson);
    } catch {
      // ignore storage errors in private mode
    }
  }, [storedProfileJson]);

  function updateItemQuantity(index: number, quantity: number) {
    setForm((current) => ({
      ...current,
      items: current.items.map((currentItem, currentIndex) =>
        currentIndex === index
          ? {
              ...currentItem,
              quantity: Math.max(1, quantity),
            }
          : currentItem,
      ),
    }));
    setOrderResponse(null);
    setOrderError(null);
  }

  async function runCalculation(
    payload: CalculateCheckoutPayload,
    options: { persistError?: boolean } = {},
  ) {
    const response = await calculateCheckout(payload);
    setCalculation(response);
    setLastCalculatedKey(JSON.stringify(payload));

    if (options.persistError !== false) {
      setError(null);
    }

    return response;
  }

  async function handleRecalculate() {
    setIsCalculating(true);
    setOrderError(null);

    try {
      await runCalculation(calculationPayload);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : 'Не удалось пересчитать заказ.';
      setError(message);
      setCalculation(null);
    } finally {
      setIsCalculating(false);
    }
  }

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setOrderError(null);
    setError(null);

    try {
      const latestCalculation = await runCalculation(calculationPayload, {
        persistError: false,
      });
      const response = await createOrder(buildOrderPayload(form, latestCalculation.total));

      setOrderResponse(response);

      if (typeof response.status === 'string' && response.status !== 'ok') {
        setOrderError('Заказ не подтвердился. Проверь ответ ниже.');
      }
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : 'Не удалось оформить заказ.';
      setOrderError(message);
      setOrderResponse(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <a className={styles.navIcon} href={EXIT_URL} aria-label="Назад">
          &larr;
        </a>
        <div className={styles.topbarTitle}>Ваш заказ</div>
        <a className={styles.navIcon} href={EXIT_URL} aria-label="Закрыть">
          ×
        </a>
      </header>

      <main className={styles.shell}>
        <form className={styles.layout} onSubmit={handleSubmit}>
          <section className={styles.leftColumn}>
            <div className={styles.accountBox}>
              <div>
                <p className={styles.accountText}>
                  {form.customer.email || form.customer.fullName
                    ? `Вы оформляете заказ как ${form.customer.fullName || 'покупатель'}`
                    : 'Оформление заказа'}
                </p>
                {form.customer.email ? (
                  <p className={styles.accountMeta}>({form.customer.email})</p>
                ) : null}
              </div>
              <a className={styles.exitButton} href={EXIT_URL}>
                Выйти
              </a>
            </div>

            <section className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Ф.И.О.</h2>
              <label className={styles.lineField}>
                <input
                  value={form.customer.fullName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      customer: {
                        ...current.customer,
                        fullName: event.target.value,
                      },
                    }))
                  }
                  placeholder="Введите Ф.И.О."
                  required
                />
              </label>
            </section>

            <section className={styles.formSection}>
              <h2 className={styles.sectionTitle}>E-Mail</h2>
              <label className={styles.lineField}>
                <input
                  type="email"
                  value={form.customer.email}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      customer: {
                        ...current.customer,
                        email: event.target.value,
                      },
                    }))
                  }
                  placeholder="mail@example.com"
                />
              </label>
            </section>

            <section className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Телефон</h2>
              <label className={styles.lineField}>
                <input
                  value={form.customer.phone}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      customer: {
                        ...current.customer,
                        phone: event.target.value,
                      },
                    }))
                  }
                  placeholder="+7 999 000-00-00"
                  required
                />
              </label>
            </section>

            <section className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Доставка</h2>

              <label className={`${styles.lineField} ${styles.selectField}`}>
                <select
                  value={form.deliveryMethod}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      deliveryMethod: event.target.value,
                    }))
                  }
                >
                  {DELIVERY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className={styles.deliveryChoices}>
                {DELIVERY_OPTIONS.map((option) => (
                  <label key={option.value} className={styles.radioRow}>
                    <input
                      type="radio"
                      name="deliveryMethod"
                      checked={form.deliveryMethod === option.value}
                      onChange={() =>
                        setForm((current) => ({
                          ...current,
                          deliveryMethod: option.value,
                        }))
                      }
                    />
                    <span>
                      {option.label} <em>{option.hint}</em>
                    </span>
                  </label>
                ))}
              </div>

              {form.deliveryMethod === 'pickup' ? (
                <div className={styles.pickupDetails}>
                  <p>{PICKUP_DETAILS.lead}</p>
                  <p>{PICKUP_DETAILS.title}</p>
                  <p>{PICKUP_DETAILS.name}</p>
                  <p>{PICKUP_DETAILS.address}</p>
                  <p>{PICKUP_DETAILS.hours}</p>
                  <p>{PICKUP_DETAILS.phones}</p>
                </div>
              ) : null}

              <label className={styles.lineField}>
                <input
                  value={form.customer.city}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      customer: {
                        ...current.customer,
                        city: event.target.value,
                      },
                    }))
                  }
                  placeholder="Москва"
                />
              </label>

              <label className={styles.lineField}>
                <input
                  value={form.customer.street}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      customer: {
                        ...current.customer,
                        street: event.target.value,
                      },
                    }))
                  }
                  placeholder="Большая Бронная"
                />
              </label>

              <div className={styles.compactGrid}>
                <label className={styles.lineField}>
                  <input
                    value={form.customer.house}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        customer: {
                          ...current.customer,
                          house: event.target.value,
                        },
                      }))
                    }
                    placeholder="10с1"
                  />
                </label>

                <label className={styles.lineField}>
                  <input
                    value={form.customer.apartment}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        customer: {
                          ...current.customer,
                          apartment: event.target.value,
                        },
                      }))
                    }
                    placeholder="12"
                  />
                </label>
              </div>

              <label className={styles.lineField}>
                <input
                  value={form.customer.intercom}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      customer: {
                        ...current.customer,
                        intercom: event.target.value,
                      },
                    }))
                  }
                  placeholder="Код или описание"
                />
              </label>
            </section>

            <section className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Промокод и сертификат</h2>
              <div className={styles.stackedFields}>
                <label className={styles.lineField}>
                  <input
                    value={form.promoCode}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        promoCode: event.target.value,
                      }))
                    }
                    placeholder="Введите промокод"
                  />
                </label>

                <label className={styles.lineField}>
                  <input
                    value={form.giftCardNumber}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        giftCardNumber: event.target.value,
                      }))
                    }
                    placeholder="Номер сертификата"
                  />
                </label>
              </div>

              <label className={styles.lineField}>
                <input
                  value={form.loyaltyCardNumber}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      loyaltyCardNumber: event.target.value,
                    }))
                  }
                  placeholder="Если есть карта"
                />
              </label>

              <div className={styles.inlineActions}>
                <button
                  className={styles.lightButton}
                  type="button"
                  onClick={handleRecalculate}
                  disabled={isCalculating || isSubmitting}
                >
                  {isCalculating ? 'Проверяем...' : 'Проверить скидку'}
                </button>

                {hasStaleCalculation ? (
                  <span className={styles.mutedText}>Цена изменена, пересчитайте заказ</span>
                ) : null}
              </div>

              {!hasStaleCalculation && getCalculationStatusMessage(calculation, subtotal) ? (
                <p className={styles.calculationMessage}>
                  {getCalculationStatusMessage(calculation, subtotal)}
                </p>
              ) : null}
            </section>

            <section className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Комментарий</h2>
              <label className={styles.lineField}>
                <textarea
                  value={form.comment}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      comment: event.target.value,
                    }))
                  }
                  rows={3}
                  placeholder="Комментарий к заказу"
                />
              </label>
            </section>

            <label className={styles.consentRow}>
              <input
                type="checkbox"
                checked={form.consentAccepted}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    consentAccepted: event.target.checked,
                  }))
                }
              />
              <span>
                Нажимая кнопку «Оформить заказ», я даю свое согласие на
                обработку моих персональных данных, в соответствии с
                Федеральным законом от 27.07.2006 года №152-ФЗ «О персональных
                данных», на условиях и для целей, определенных в Согласии на
                обработку персональных данных
              </span>
            </label>

            <div className={styles.submitRow}>
              <button
                className={styles.primaryButton}
                type="submit"
                disabled={isSubmitting || isCalculating || !form.consentAccepted}
              >
                {isSubmitting ? 'Оформляем заказ...' : 'Оформить заказ'}
              </button>
            </div>

            {error ? <p className={styles.errorText}>{error}</p> : null}
            {orderError ? <p className={styles.errorText}>{orderError}</p> : null}
            {getCompatibilityMessage(calculation) ? (
              <p className={styles.noteText}>{getCompatibilityMessage(calculation)}</p>
            ) : null}
            {getPromocodeLabel(calculation) ? (
              <p className={styles.noteText}>Промокод: {getPromocodeLabel(calculation)}</p>
            ) : null}
          </section>

          <aside className={styles.rightColumn}>
            <div className={styles.summaryCard}>
              {form.items.map((item, index) => (
                <article key={`${item.sku}-${index}`} className={styles.productRow}>
                  <div className={styles.productThumb}>
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt={item.title ?? 'Товар'} />
                    ) : (
                      item.title?.slice(0, 1).toUpperCase() ?? 'A'
                    )}
                  </div>

                  <div className={styles.productInfo}>
                    <input
                      className={styles.productTitle}
                      value={item.title ?? ''}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          items: current.items.map((currentItem, currentIndex) =>
                            currentIndex === index
                              ? { ...currentItem, title: event.target.value }
                              : currentItem,
                          ),
                        }))
                      }
                    />
                    <p className={styles.productMeta}>Артикул: {item.sku}</p>
                  </div>

                  <div className={styles.productControls}>
                    <div className={styles.qtyBox}>
                      <button
                        type="button"
                        onClick={() => updateItemQuantity(index, item.quantity - 1)}
                      >
                        -
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateItemQuantity(index, item.quantity + 1)}
                      >
                        +
                      </button>
                    </div>

                    <div className={styles.priceBox}>{formatCurrency(item.price * item.quantity)}</div>
                  </div>
                </article>
              ))}

              <div className={styles.summaryMeta}>
                <p>{deliveryOption.summary}: 0 ₽</p>
                <p>{addressSummary}</p>
                <strong>Итоговая сумма: {formatCurrency(total)}</strong>
              </div>

              {orderStatus ? (
                <div className={styles.responseBox}>
                  <p className={styles.responseStatus}>Статус: {orderStatus}</p>
                  <pre>{JSON.stringify(orderResponse, null, 2)}</pre>
                </div>
              ) : null}
            </div>
          </aside>
        </form>
      </main>
    </div>
  );
}
