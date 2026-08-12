'use client';

import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  calculateCheckout,
  createOrder,
  createPaykeeperPayment,
} from '@/lib/api';
import type {
  CalculateCheckoutPayload,
  CheckoutCalculationResponse,
  CheckoutItemInput,
  CreateOrderPayload,
  PaymentMethod,
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

const PAYMENT_OPTIONS: Array<{
  value: PaymentMethod;
  label: string;
  hint: string;
}> = [
  {
    value: 'cash_on_delivery',
    label: 'Оплата при получении',
    hint: 'наличными или картой при получении',
  },
  {
    value: 'online_card',
    label: 'Оплата картой онлайн',
    hint: 'банковской картой на защищенной странице',
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
const CHECKOUT_LOYALTY_PHONE_KEY = 'lapaloma_checkout_loyalty_phone_v1';

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
  paymentMethod: PaymentMethod;
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

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '');
}

function isPhoneReady(phone: string) {
  return normalizePhone(phone).length >= 10;
}

function normalizeDiscountCode(value: string) {
  return value.trim().toUpperCase();
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

function readStoredLoyaltyPhone() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(CHECKOUT_LOYALTY_PHONE_KEY);
    return rawValue ? normalizePhone(rawValue) || null : null;
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

function buildCalculationPayload(
  form: CheckoutFormState,
  options: { registerInLoyaltyProgram?: boolean } = {},
): CalculateCheckoutPayload {
  return {
    phone: form.customer.phone.trim() || undefined,
    promoCode: normalizeDiscountCode(form.promoCode) || undefined,
    giftCardNumber: normalizeDiscountCode(form.giftCardNumber) || undefined,
    registerInLoyaltyProgram: options.registerInLoyaltyProgram || undefined,
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
    paymentMethod: form.paymentMethod,
    loyaltyCardNumber: form.loyaltyCardNumber.trim() || undefined,
    promoCode: normalizeDiscountCode(form.promoCode) || undefined,
    giftCardNumber: normalizeDiscountCode(form.giftCardNumber) || undefined,
    comment: buildOrderComment(form),
    totalAmount,
    items: form.items.map((item) => ({
      sku: item.sku.trim(),
      title: (item.title ?? '').trim() || undefined,
      image: item.image?.trim() || undefined,
      quantity: Math.max(1, Math.trunc(item.quantity || 1)),
      price: Math.max(0, Number(item.price || 0)),
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

function hasEffectiveDiscount(
  result: CheckoutCalculationResponse | null,
  subtotal: number,
) {
  if (!result) {
    return false;
  }

  const { totalDiscount, prepaidAmount } = getDiscountBreakdown(result);
  const discountAmount = Math.max(0, subtotal - (result.total ?? result.totalAmount) as number);

  return discountAmount > 0 || totalDiscount > 0 || prepaidAmount > 0;
}

function getCalculationStatusMessage(
  result: CheckoutCalculationResponse | null,
  subtotal: number,
) {
  if (!result) {
    return null;
  }

  const discountAmount = Math.max(0, subtotal - (result.total ?? result.totalAmount) as number);
  const hasDiscounts = hasEffectiveDiscount(result, subtotal);
  const hasRegisteredInLoyalty = Boolean(result.payload.registerInLoyaltyProgram);
  const hasPromo = Boolean(getPromocodeLabel(result)) && hasDiscounts;
  const hasGiftCards =
    Array.isArray(result.giftCards) && result.giftCards.length > 0 && hasDiscounts;

  if (discountAmount > 0) {
    return hasRegisteredInLoyalty
      ? `Скидка программы лояльности применена. Экономия ${formatCurrency(discountAmount)}, итоговая сумма ${formatCurrency((result.total ?? result.totalAmount) as number)}.`
      : `Скидка применена. Экономия ${formatCurrency(discountAmount)}, итоговая сумма ${formatCurrency((result.total ?? result.totalAmount) as number)}.`;
  }

  if (hasPromo || hasGiftCards || hasDiscounts) {
    return `Проверка выполнена. Итоговая сумма: ${formatCurrency((result.total ?? result.totalAmount) as number)}.`;
  }

  if (hasRegisteredInLoyalty) {
    return `Регистрация в программе лояльности отправлена. Сейчас итоговая сумма: ${formatCurrency((result.total ?? result.totalAmount) as number)}.`;
  }

  return `Скидка не найдена. Итоговая сумма без изменений: ${formatCurrency((result.total ?? result.totalAmount) as number)}.`;
}

function shouldOfferLoyaltyRegistration(
  result: CheckoutCalculationResponse | null,
  subtotal: number,
) {
  if (!result || !isPhoneReady(result.payload.phone ?? '')) {
    return false;
  }

  if (result.payload.registerInLoyaltyProgram) {
    return false;
  }

  const { totalDiscount, prepaidAmount } = getDiscountBreakdown(result);
  const discountAmount = Math.max(0, subtotal - (result.total ?? result.totalAmount) as number);
  const hasPromo = Boolean(getPromocodeLabel(result));
  const hasGiftCards = Array.isArray(result.giftCards) && result.giftCards.length > 0;
  const loyalty = isRecord(result.loyalty) ? result.loyalty : null;

  if (loyalty?.suggestRegistration === true) {
    return true;
  }

  return (
    discountAmount <= 0 &&
    totalDiscount <= 0 &&
    prepaidAmount <= 0 &&
    !hasPromo &&
    !hasGiftCards
  );
}

function getCalculationSourceMessage(
  result: CheckoutCalculationResponse | null,
  subtotal: number,
) {
  if (!result) {
    return null;
  }

  const { totalDiscount, prepaidAmount } = getDiscountBreakdown(result);
  const discountAmount = Math.max(0, subtotal - (result.total ?? result.totalAmount) as number);
  const hasActualDiscount = hasEffectiveDiscount(result, subtotal);
  const promoLabel = getPromocodeLabel(result);
  const hasPromo = Boolean(promoLabel) && hasActualDiscount;
  const hasGiftCards =
    (Array.isArray(result.giftCards) && result.giftCards.length > 0 && hasActualDiscount) ||
    prepaidAmount > 0;
  const hasClientDiscount =
    !hasPromo &&
    !hasGiftCards &&
    Boolean(
      isPhoneReady(result.payload.phone ?? '') &&
        (discountAmount > 0 || totalDiscount > 0),
    );

  if (hasPromo && hasGiftCards) {
    return 'Источник скидки: промокод и сертификат';
  }

  if (hasPromo) {
    return `Источник скидки: промокод${promoLabel ? ` (${promoLabel})` : ''}`;
  }

  if (hasGiftCards) {
    return 'Источник скидки: сертификат';
  }

  if (hasClientDiscount) {
    return 'Источник скидки: скидка клиента';
  }

  return null;
}

function getAcceptedCalculationMessage(
  result: CheckoutCalculationResponse | null,
  subtotal: number,
) {
  if (!result) {
    return null;
  }

  const { totalDiscount, prepaidAmount } = getDiscountBreakdown(result);
  const discountAmount = Math.max(0, subtotal - (result.total ?? result.totalAmount) as number);
  const hasActualDiscount = hasEffectiveDiscount(result, subtotal);
  const promoLabel = getPromocodeLabel(result);
  const hasPromo = Boolean(promoLabel) && hasActualDiscount;
  const hasGiftCards =
    (Array.isArray(result.giftCards) && result.giftCards.length > 0 && hasActualDiscount) ||
    prepaidAmount > 0;
  const hasClientDiscount =
    !hasPromo &&
    !hasGiftCards &&
    Boolean(
      isPhoneReady(result.payload.phone ?? '') &&
        (discountAmount > 0 || totalDiscount > 0),
    );

  if (hasPromo && hasGiftCards) {
    return 'Промокод и сертификат применились';
  }

  if (hasPromo) {
    return promoLabel
      ? `Промокод ${promoLabel} применился`
      : 'Промокод применился';
  }

  if (hasGiftCards) {
    return 'Сертификат применился';
  }

  if (hasClientDiscount) {
    return 'Скидка клиента применилась';
  }

  if (hasActualDiscount) {
    return 'Скидка применилась';
  }

  return null;
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
  const [paymentRedirectUrl, setPaymentRedirectUrl] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastCalculatedKey, setLastCalculatedKey] = useState<string>('');
  const [calculationProgressLabel, setCalculationProgressLabel] = useState<string | null>(
    null,
  );
  const [loyaltyRegistrationPhone, setLoyaltyRegistrationPhone] = useState<string | null>(() =>
    readStoredLoyaltyPhone(),
  );
  const [hadKnownCustomerAtStart] = useState(() => {
    const mergedForm = mergeStoredProfile(initialForm, readStoredProfile());
    return isPhoneReady(mergedForm.customer.phone);
  });
  const autoCalculatedLoyaltyRef = useRef(false);
  const calculationRequestIdRef = useRef(0);

  const normalizedPhone = useMemo(
    () => normalizePhone(form.customer.phone),
    [form.customer.phone],
  );
  const hasManualDiscountInput = Boolean(
    normalizeDiscountCode(form.promoCode) || normalizeDiscountCode(form.giftCardNumber),
  );
  const registerInLoyaltyProgram =
    !hasManualDiscountInput &&
    Boolean(loyaltyRegistrationPhone) &&
    loyaltyRegistrationPhone === normalizedPhone;
  const calculationPayload = useMemo(
    () => buildCalculationPayload(form, { registerInLoyaltyProgram }),
    [form, registerInLoyaltyProgram],
  );
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
    hasStaleCalculation || !calculation ? subtotal : (calculation.total ?? calculation.totalAmount);
  const orderStatus =
    typeof orderResponse?.status === 'string' ? orderResponse.status : null;
  const isOrderSuccessful =
    orderStatus === 'ok' &&
    (form.paymentMethod === 'cash_on_delivery' || Boolean(paymentRedirectUrl));
  const deliveryOption = getDeliveryOption(form.deliveryMethod);
  const addressSummary =
    buildAddress(form.customer) ?? 'Россия, Москва';
  const storedProfileJson = useMemo(() => JSON.stringify(buildStoredProfile(form)), [form]);
  const canOfferLoyaltyRegistration =
    !hasStaleCalculation && shouldOfferLoyaltyRegistration(calculation, subtotal);
  const acceptedCalculationMessage =
    !hasStaleCalculation ? getAcceptedCalculationMessage(calculation, subtotal) : null;
  const calculationSourceMessage =
    !hasStaleCalculation ? getCalculationSourceMessage(calculation, subtotal) : null;

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      if (loyaltyRegistrationPhone) {
        window.localStorage.setItem(
          CHECKOUT_LOYALTY_PHONE_KEY,
          loyaltyRegistrationPhone,
        );
      } else {
        window.localStorage.removeItem(CHECKOUT_LOYALTY_PHONE_KEY);
      }
    } catch {
      // ignore storage errors in private mode
    }
  }, [loyaltyRegistrationPhone]);

  useEffect(() => {
    if (
      !hadKnownCustomerAtStart ||
      autoCalculatedLoyaltyRef.current ||
      !isPhoneReady(form.customer.phone) ||
        hasManualDiscountInput ||
      isCalculating ||
      isSubmitting
    ) {
      return;
    }

    let cancelled = false;
    autoCalculatedLoyaltyRef.current = true;

    const runAutoCalculation = async () => {
      setIsCalculating(true);
      setOrderError(null);

      try {
        setCalculationProgressLabel('Проверяем скидку для вашего профиля...');
        await runCalculation(calculationPayload);
      } catch (submitError) {
        if (cancelled) {
          return;
        }

        const message =
          submitError instanceof Error
            ? submitError.message
            : 'Не удалось автоматически проверить скидку.';
        setError(message);
        setCalculation(null);
      } finally {
        if (!cancelled) {
          setIsCalculating(false);
          setCalculationProgressLabel(null);
        }
      }
    };

    void runAutoCalculation();

    return () => {
      cancelled = true;
    };
  }, [
    calculationPayload,
    form,
    hasManualDiscountInput,
    hadKnownCustomerAtStart,
    isCalculating,
    isSubmitting,
  ]);

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
    const requestId = ++calculationRequestIdRef.current;
    let response: CheckoutCalculationResponse | null = null;
    try {
      response = await calculateCheckout(payload);
    } finally {
      if (requestId === calculationRequestIdRef.current) {
        setIsCalculating(false);
        setCalculationProgressLabel(null);
      }
    }

    if (requestId !== calculationRequestIdRef.current) {
      return response;
    }

    setCalculation(response);
    setLastCalculatedKey(JSON.stringify(payload));

    if (options.persistError !== false) {
      setError(null);
    }

    return response;
  }

  function stopAutoProfileCalculation() {
    calculationRequestIdRef.current += 1;
    setIsCalculating(false);
    setCalculationProgressLabel(null);
  }

  function handleManualDiscountFieldChange(
    field: 'promoCode' | 'giftCardNumber',
    value: string,
  ) {
    stopAutoProfileCalculation();
    setCalculation(null);
    setLastCalculatedKey('');
    setOrderResponse(null);
    setOrderError(null);
    setError(null);

    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function resolveDiscountFields(currentForm: CheckoutFormState) {
    const promoCode = normalizeDiscountCode(currentForm.promoCode);
    const giftCardNumber = normalizeDiscountCode(currentForm.giftCardNumber);

    return {
      ...currentForm,
      promoCode,
      giftCardNumber,
    };
  }

  async function handleRecalculate() {
    setIsCalculating(true);
    setOrderError(null);
    setError(null);
    setCalculationProgressLabel('Подготавливаем проверку...');

    try {
      const resolvedForm = await resolveDiscountFields(form);

      if (
        resolvedForm.promoCode !== form.promoCode ||
        resolvedForm.giftCardNumber !== form.giftCardNumber
      ) {
        setForm(resolvedForm);
      }

      await runCalculation(
        buildCalculationPayload(resolvedForm, { registerInLoyaltyProgram }),
      );
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : 'Не удалось пересчитать заказ.';
      setError(message);
      setCalculation(null);
    } finally {
      setIsCalculating(false);
      setCalculationProgressLabel(null);
    }
  }

  async function handleLoyaltyRegistration() {
    if (!isPhoneReady(form.customer.phone)) {
      setError('Для регистрации в программе лояльности укажите телефон.');
      return;
    }

    setIsCalculating(true);
    setOrderError(null);
    setError(null);
    setCalculationProgressLabel('Подключаем программу лояльности...');

    try {
      setLoyaltyRegistrationPhone(normalizedPhone);
      await runCalculation(
        buildCalculationPayload(form, {
          registerInLoyaltyProgram: true,
        }),
      );
    } catch (submitError) {
      setLoyaltyRegistrationPhone(null);
      const message =
        submitError instanceof Error
          ? submitError.message
          : 'Не удалось подключить программу лояльности.';
      setError(message);
      setCalculation(null);
    } finally {
      setIsCalculating(false);
      setCalculationProgressLabel(null);
    }
  }

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setOrderError(null);
    setError(null);
    setOrderResponse(null);
    setPaymentRedirectUrl(null);

    let responseStatus: string | null = null;
    let orderId: string | null = null;

    try {
      const resolvedForm = await resolveDiscountFields(form);

      if (
        resolvedForm.promoCode !== form.promoCode ||
        resolvedForm.giftCardNumber !== form.giftCardNumber
      ) {
        setForm(resolvedForm);
      }

      let latestCalculation: CheckoutCalculationResponse | null = null;
      try {
        latestCalculation = await runCalculation(
          buildCalculationPayload(resolvedForm, { registerInLoyaltyProgram }),
          {
            persistError: false,
          },
        );
      } catch (calcError) {
        const isTimeout =
          (calcError instanceof Error && calcError.name === 'AbortError') ||
          (calcError instanceof Error && /долго отвечает|timeout|timed out|AbortError/i.test(calcError.message));
        if (!isTimeout) {
          throw calcError;
        }
        latestCalculation = null;
      }

      const orderTotal =
        latestCalculation?.totalAmount ??
        latestCalculation?.total ??
        subtotal;

      const response = await createOrder(
        buildOrderPayload(resolvedForm, orderTotal),
      );

      setOrderResponse(response);

      responseStatus =
        typeof response?.status === 'string' ? response.status : null;
      orderId =
        typeof (response as Record<string, unknown>)?.id === 'string'
          ? ((response as Record<string, unknown>).id as string)
          : null;

      if (responseStatus === 'ok' && form.paymentMethod === 'online_card') {
        if (!orderId) {
          setOrderError('Не удалось получить ID заказа для создания платежа. Попробуй чуть позже или выбери оплату при получении.');
          setOrderResponse(null);
          return;
        }
        try {
          const invoice = await createPaykeeperPayment({
            orderId: orderId!,
            amount: Math.max(1, Math.trunc(orderTotal)),
            clientEmail: form.customer.email.trim() || undefined,
            clientPhone: form.customer.phone.trim() || undefined,
            description: `Оплата заказа ${String(orderId ?? '').slice(0, 8)} в магазине ANETTE`,
          });
          if (invoice && typeof (invoice as Record<string, unknown>).paymentUrl === 'string') {
            if (typeof window !== 'undefined') {
              const targetUrl = (invoice as Record<string, unknown>).paymentUrl as string;
              setPaymentRedirectUrl(targetUrl);
              try {
                window.location.assign(targetUrl);
              } catch {
                window.location.href = targetUrl;
              }
              return;
            }
          } else {
            const raw = JSON.stringify(invoice ?? {});
            throw new Error(
              `Не удалось получить ссылку на оплату. Ответ платежной системы: ${raw.slice(0, 200)}`,
            );
          }
        } catch (pkError) {
          let pkMessage =
            pkError instanceof Error ? pkError.message : 'Не удалось создать платеж.';
          const hasSensitiveName = /paykeeper|maxma|onek|onec|tilda|1с/i.test(pkMessage);
          let debugJson: string | null = null;
          try {
            debugJson = JSON.stringify(pkError instanceof Error ? {name: pkError.name, message: pkError.message, stack: pkError.stack} : pkError);
          } catch {
            debugJson = null;
          }
          if (hasSensitiveName) {
            pkMessage = pkMessage.replace(/paykeeper[^a-zа-я0-9]*/gi, 'Платежная система').replace(/Платежная система\s+/gi, 'Платежная система ');
            pkMessage = pkMessage.replace(/maxma[^a-zа-я0-9]*/gi, 'Сервис скидок ').replace(/Сервис скидок\s+/gi, 'Сервис скидок ');
          }
          const extra = debugJson && debugJson.length > 20 ? `\n\nПодробности: ${debugJson.slice(0, 800)}` : '';
          setOrderError(pkMessage + extra);
          setOrderResponse(null);
          setPaymentRedirectUrl(null);
          return;
        }
      }

      if (responseStatus !== 'ok') {
        const details =
          typeof (response as Record<string, unknown> | null)?.message === 'string'
            ? ((response as Record<string, unknown>).message as string)
            : '';
        let raw = '';
        try {
          raw = JSON.stringify(response).slice(0, 800);
        } catch {}
        setOrderError(
          'Заказ не подтвердился.' + (details ? ` ${details}` : '') + (raw.length > 20 ? `\n\nПодробности: ${raw}` : ''),
        );
      }
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : 'Не удалось оформить заказ.';
      let extra = '';
      try {
        const obj =
          submitError instanceof Error
            ? { name: submitError.name, message: submitError.message, stack: submitError.stack }
            : submitError;
        const raw = JSON.stringify(obj).slice(0, 800);
        if (raw.length > 20) extra = `\n\nПодробности: ${raw}`;
      } catch {}
      setOrderError(message + extra);
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
                        handleManualDiscountFieldChange('promoCode', event.target.value)
                      }
                    placeholder="Введите промокод"
                  />
                </label>

                <label className={styles.lineField}>
                  <input
                    value={form.giftCardNumber}
                      onChange={(event) =>
                        handleManualDiscountFieldChange('giftCardNumber', event.target.value)
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
                    {isCalculating
                      ? calculationProgressLabel || 'Проверяем...'
                      : 'Проверить скидку'}
                </button>

                {hasStaleCalculation ? (
                  <span className={styles.mutedText}>Цена изменена, пересчитайте заказ</span>
                ) : null}
              </div>

                {hadKnownCustomerAtStart && !calculation && !error ? (
                  <p className={styles.noteText}>
                    Скидку для вашего профиля проверяем автоматически.
                  </p>
                ) : null}

              {!hasStaleCalculation && getCalculationStatusMessage(calculation, subtotal) ? (
                <p className={styles.calculationMessage}>
                  {getCalculationStatusMessage(calculation, subtotal)}
                </p>
              ) : null}

                {!hasStaleCalculation && acceptedCalculationMessage ? (
                  <div className={styles.acceptedBadge}>
                    <p className={styles.acceptedBadgeTitle}>Принято</p>
                    <p className={styles.acceptedBadgeText}>{acceptedCalculationMessage}</p>
                    {calculationSourceMessage ? (
                      <p className={styles.acceptedBadgeMeta}>{calculationSourceMessage}</p>
                    ) : null}
                  </div>
                ) : null}

                {canOfferLoyaltyRegistration ? (
                  <div className={styles.loyaltyCard}>
                    <p className={styles.loyaltyTitle}>Программа лояльности</p>
                    <p className={styles.loyaltyText}>
                      Если система еще не нашла ваш профиль, зарегистрируйтесь перед
                      оплатой. После этого корзина пересчитается автоматически.
                    </p>
                    <button
                      className={styles.lightButton}
                      type="button"
                      onClick={handleLoyaltyRegistration}
                      disabled={isCalculating || isSubmitting}
                    >
                      {registerInLoyaltyProgram && isCalculating
                        ? 'Подключаем...'
                        : 'Зарегистрироваться и пересчитать'}
                    </button>
                  </div>
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

            <section className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Оплата</h2>

              <label className={`${styles.lineField} ${styles.selectField}`}>
                <select
                  value={form.paymentMethod}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      paymentMethod:
                        (event.target.value as PaymentMethod) ||
                        'cash_on_delivery',
                    }))
                  }
                >
                  {PAYMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className={styles.deliveryChoices}>
                {PAYMENT_OPTIONS.map((option) => (
                  <label key={option.value} className={styles.radioRow}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={form.paymentMethod === option.value}
                      onChange={() =>
                        setForm((current) => ({
                          ...current,
                          paymentMethod: option.value,
                        }))
                      }
                    />
                    <span>
                      {option.label} <em>{option.hint}</em>
                    </span>
                  </label>
                ))}
              </div>

              <p className={styles.noteText}>
                {form.paymentMethod === 'online_card'
                  ? 'После нажатия «Оформить заказ» вы будете перенаправлены на защищенную страницу оплаты. После успешной оплаты мы вернем вас на сайт.'
                  : 'Оплата производится наличными или картой при получении заказа.'}
              </p>
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
            {orderError ? (
              <div className={styles.successBanner} style={{borderColor:'rgba(215, 31, 31, 0.35)', background:'rgba(215,31,31,0.07)', color:'#8b1212'}}>
                <p className={styles.successBannerTitle} style={{color:'#7a1010'}}>Не удалось оформить заказ</p>
                <p className={styles.successBannerText} style={{color:'#8b1212'}}>{orderError}</p>
              </div>
            ) : null}
            {isOrderSuccessful && !orderError ? (
              <div className={styles.successBanner}>
                {paymentRedirectUrl ? (
                  <>
                    <p className={styles.successBannerTitle}>Переходим к оплате</p>
                    <p className={styles.successBannerText}>
                      Если страница оплаты не открылась в течение 5 секунд — нажми на ссылку ниже:
                    </p>
                    <p style={{margin: '10px 0 0 0'}}>
                      <a
                        href={paymentRedirectUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-block',
                          padding: '12px 22px',
                          background: '#0e5a31',
                          color: '#fff',
                          textDecoration: 'none',
                          borderRadius: 10,
                          fontWeight: 600,
                        }}
                      >
                        Перейти к оплате →
                      </a>
                    </p>
                  </>
                ) : (
                  <>
                    <p className={styles.successBannerTitle}>Заявка отправлена</p>
                    <p className={styles.successBannerText}>
                      {form.paymentMethod === 'online_card'
                        ? 'Сейчас вы будете перенаправлены на страницу оплаты. После успешной оплаты мы вернем вас на сайт.'
                        : 'Мы свяжемся с вами в ближайшее время для подтверждения и согласования доставки. Спасибо за заказ!'}
                    </p>
                  </>
                )}
              </div>
            ) : null}
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

              {isOrderSuccessful ? (
                <p className={styles.successText}>Заказ отправлен</p>
              ) : null}
            </div>
          </aside>
        </form>
      </main>
    </div>
  );
}
