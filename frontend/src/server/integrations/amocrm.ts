import { getAppConfig, hasRealValue } from '@/server/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { CreateOrderPayload } from '@/types/api';

const AMOCRM_REQUEST_TIMEOUT_MS = 15000;

type AmoConfig = ReturnType<typeof getAppConfig>['integrations']['amocrm'];
type SmtpConfig = ReturnType<typeof getAppConfig>['integrations']['smtp'];

type AmoMode = 'api' | 'email' | 'stub';

function detectMode(): { mode: AmoMode; reason?: string } {
  const appConfig = getAppConfig();
  if (appConfig.integrations.mode !== 'live') {
    return { mode: 'stub', reason: 'integrations-mode-stub' };
  }

  const amo = appConfig.integrations.amocrm;
  if (hasRealValue(amo.baseUrl) && hasRealValue(amo.accessToken)) {
    return { mode: 'api' };
  }

  const smtp = appConfig.integrations.smtp;
  if (
    hasRealValue(amo.inboxEmail) &&
    hasRealValue(smtp.host) &&
    hasRealValue(smtp.user) &&
    hasRealValue(smtp.password)
  ) {
    return { mode: 'email' };
  }

  return { mode: 'stub', reason: 'amocrm-neither-api-nor-email-configured' };
}

function isApiLiveEnabled(config: AmoConfig): boolean {
  return (
    getAppConfig().integrations.mode === 'live' &&
    hasRealValue(config.baseUrl) &&
    hasRealValue(config.accessToken)
  );
}

function buildUrl(path: string): string {
  const baseUrl = getAppConfig().integrations.amocrm.baseUrl;
  return new URL(path, baseUrl ?? 'http://localhost').toString();
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('8')) {
    return '+7' + digits.slice(1);
  }
  if (digits.startsWith('7') && digits.length === 11) {
    return '+' + digits;
  }
  if (digits.length === 10) {
    return '+7' + digits;
  }
  return digits;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value);
}

function buildItemsText(items: CreateOrderPayload['items']): string {
  if (items.length === 0) {
    return 'Состав заказа не передан';
  }

  return items
    .map((item, i) => {
      const title = item.title?.trim() || `Товар ${i + 1}`;
      const sku = item.sku?.trim() || '—';
      const qty = item.quantity ?? 1;
      const price = item.price ?? 0;
      const sum = price * qty;
      return `${i + 1}. ${title}\n   Артикул: ${sku}\n   Количество: ${qty} шт.\n   Цена: ${formatCurrency(price)}\n   Сумма: ${formatCurrency(sum)}`;
    })
    .join('\n\n');
}

async function request(
  path: string,
  action: string,
  body: unknown,
  method: 'GET' | 'POST' | 'PATCH' = 'POST',
): Promise<{
  status: 'ok' | 'error' | 'stub';
  mode: 'live' | 'stub';
  target: 'amocrm';
  action: string;
  responseStatusCode?: number;
  responseBody?: unknown;
  payload?: unknown;
}> {
  const config = getAppConfig().integrations.amocrm;

  if (!isApiLiveEnabled(config)) {
    return {
      status: 'stub',
      mode: 'stub',
      target: 'amocrm',
      action,
      payload: body,
    };
  }

  const url = buildUrl(path);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AMOCRM_REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.accessToken}`,
      },
      body: method !== 'GET' ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('amoCRM долго отвечает');
    }
    throw error;
  }

  clearTimeout(timeoutId);
  const responseText = await response.text();
  let responseBody: unknown = responseText;

  if (responseText) {
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = responseText;
    }
  }

  return {
    status: response.ok ? 'ok' : 'error',
    mode: 'live',
    target: 'amocrm',
    action,
    responseStatusCode: response.status,
    responseBody,
    payload: body,
  };
}

async function findContactByPhone(
  phone: string,
): Promise<{ id: number; name?: string } | null> {
  const normalized = normalizePhone(phone);
  const query = normalized.replace(/^\+/, '');
  const result = await request(
    `/api/v4/contacts?query=${encodeURIComponent(query)}`,
    'find-contact',
    undefined,
    'GET',
  );

  if (result.status !== 'ok') {
    return null;
  }

  const body = result.responseBody as { _embedded?: { contacts?: Array<{ id: number; name?: string }> } };
  const contacts = body?._embedded?.contacts ?? [];
  return contacts[0] ?? null;
}

async function createContact(payload: {
  fullName: string;
  phone?: string;
  email?: string;
}): Promise<{ id: number } | null> {
  const customFieldsValues: Array<{
    field_id: number;
    values: Array<{ value: string; enum_id?: number }>;
  }> = [];

  if (payload.phone) {
    customFieldsValues.push({
      field_id: 394493,
      values: [
        {
          value: normalizePhone(payload.phone),
          enum_id: 367043,
        },
      ],
    });
  }

  if (payload.email) {
    customFieldsValues.push({
      field_id: 394495,
      values: [
        {
          value: normalizeEmail(payload.email),
          enum_id: 367051,
        },
      ],
    });
  }

  const body: Array<{
    name: string;
    custom_fields_values?: typeof customFieldsValues;
  }> = [
    {
      name: payload.fullName?.trim() || 'Покупатель без имени',
      ...(customFieldsValues.length > 0 ? { custom_fields_values: customFieldsValues } : {}),
    },
  ];

  const result = await request('/api/v4/contacts', 'create-contact', body);

  if (result.status !== 'ok') {
    return null;
  }

  const responseBody = result.responseBody as {
    _embedded?: { contacts?: Array<{ id: number }> };
  };
  return responseBody?._embedded?.contacts?.[0] ?? null;
}

async function findOrCreateContact(payload: {
  fullName: string;
  phone?: string;
  email?: string;
}): Promise<{ id: number; wasCreated: boolean }> {
  if (payload.phone) {
    const existing = await findContactByPhone(payload.phone);
    if (existing) {
      return { id: existing.id, wasCreated: false };
    }
  }

  const created = await createContact(payload);
  if (created) {
    return { id: created.id, wasCreated: true };
  }

  return { id: 0, wasCreated: false };
}

async function addNoteToLead(leadId: number, noteText: string): Promise<void> {
  const body = [
    {
      entity_id: leadId,
      note_type: 'common',
      params: {
        text: noteText,
      },
    },
  ];

  await request(`/api/v4/leads/notes`, 'add-lead-note', body);
}

let cachedTransporter: Transporter<SMTPTransport.SentMessageInfo> | null = null;

function getSmtpTransporter(smtp: SmtpConfig): Transporter<SMTPTransport.SentMessageInfo> {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const port = smtp.port ?? (smtp.secure ? 465 : 587);
  const secure = smtp.secure ?? port === 465;

  cachedTransporter = nodemailer.createTransport({
    host: smtp.host!,
    port,
    secure,
    auth: {
      user: smtp.user!,
      pass: smtp.password!,
    },
  });

  return cachedTransporter;
}

function buildEmailSubject(payload: CreateOrderPayload, finalSum: number): string {
  const name = payload.customer.fullName?.trim() || 'Без имени';
  return `Заказ с сайта — ${name} — ${formatCurrency(finalSum)} — ${new Date().toLocaleString('ru-RU')}`;
}

function buildDiscountBlock(maxmaDiscountInfo: {
  subtotal: number;
  totalDiscount: number;
  prepaidAmount: number;
  finalTotal: number;
  promoCode?: string;
  giftCardNumber?: string;
  loyaltyApplied?: boolean;
  discountBreakdown?: unknown;
}): string {
  return [
    '',
    '=== Скидки MAXMA ===',
    `Сумма корзины (без скидок): ${formatCurrency(maxmaDiscountInfo.subtotal)}`,
    `Скидка по акции/промо/лояльности: ${formatCurrency(maxmaDiscountInfo.totalDiscount)}`,
    `Оплачено подарочной картой: ${formatCurrency(maxmaDiscountInfo.prepaidAmount)}`,
    `Итого к оплате: ${formatCurrency(maxmaDiscountInfo.finalTotal)}`,
    maxmaDiscountInfo.promoCode ? `Промокод применен: ${maxmaDiscountInfo.promoCode}` : null,
    maxmaDiscountInfo.giftCardNumber ? `Подарочная карта: ${maxmaDiscountInfo.giftCardNumber}` : null,
    maxmaDiscountInfo.loyaltyApplied ? 'Применена скидка лояльности' : null,
  ]
    .filter((l): l is string => typeof l === 'string')
    .join('\n');
}

function buildFullNoteText(
  payload: CreateOrderPayload,
  subtotal: number,
  discount: number,
  giftCardUsed: number,
  finalSum: number,
  maxmaDiscountInfo?: {
    subtotal: number;
    totalDiscount: number;
    prepaidAmount: number;
    finalTotal: number;
    promoCode?: string;
    giftCardNumber?: string;
    loyaltyApplied?: boolean;
    discountBreakdown?: unknown;
  },
  txid?: string,
): string {
  const lines: string[] = [];

  lines.push('=== Контактные данные ===');
  lines.push(`ФИО: ${payload.customer.fullName?.trim() || 'Не указано'}`);
  lines.push(`Телефон: ${payload.customer.phone?.trim() || 'Не указан'}`);
  if (payload.customer.email) {
    lines.push(`Email: ${payload.customer.email}`);
  }

  lines.push('', '=== Данные заказа ===', '');
  lines.push(buildItemsText(payload.items));
  lines.push('', `Итого по позициям: ${formatCurrency(subtotal)}`);
  if (discount > 0) lines.push(`Скидка: ${formatCurrency(discount)}`);
  if (giftCardUsed > 0) lines.push(`Подарочная карта: ${formatCurrency(giftCardUsed)}`);
  lines.push(`Финальная сумма: ${formatCurrency(finalSum)}`);

  lines.push('', '=== Доставка и оплата ===');
  lines.push(`Способ доставки: ${payload.deliveryMethod?.trim() || 'Не указан'}`);
  lines.push(
    `Способ оплаты: ${
      payload.paymentMethod === 'online_card'
        ? 'Онлайн картой'
        : payload.paymentMethod === 'cash_on_delivery'
          ? 'При получении'
          : 'Не указан'
    }`,
  );
  lines.push(`Адрес: ${payload.customer.address?.trim() || 'Не указан'}`);
  if (payload.comment) {
    lines.push(`Комментарий покупателя: ${payload.comment}`);
  }

  if (payload.promoCode) lines.push(`Промокод: ${payload.promoCode}`);
  if (payload.giftCardNumber) lines.push(`Подарочная карта (номер): ${payload.giftCardNumber}`);
  if (txid) lines.push(`ID платежа (txid): ${txid}`);

  if (maxmaDiscountInfo) {
    lines.push(buildDiscountBlock(maxmaDiscountInfo));
  }

  return lines.join('\n');
}

async function sendLeadViaEmail(
  payload: CreateOrderPayload,
  options: {
    txid?: string;
    maxmaDiscountInfo?: {
      subtotal: number;
      totalDiscount: number;
      prepaidAmount: number;
      finalTotal: number;
      promoCode?: string;
      giftCardNumber?: string;
      loyaltyApplied?: boolean;
      discountBreakdown?: unknown;
    };
  } = {},
): Promise<{
  status: 'ok' | 'error' | 'stub' | 'degraded';
  mode: 'email';
  target: 'amocrm';
  action: 'create-order-lead';
  messageId?: string;
  inboxEmail?: string;
  smtpHost?: string;
  reason?: string;
  debug?: Record<string, unknown>;
}> {
  const appConfig = getAppConfig();
  const amo = appConfig.integrations.amocrm;
  const smtp = appConfig.integrations.smtp;

  const subtotal = payload.items.reduce(
    (sum, item) => sum + (item.price ?? 0) * (item.quantity ?? 1),
    0,
  );
  const discount = options.maxmaDiscountInfo?.totalDiscount ?? 0;
  const giftCardUsed = options.maxmaDiscountInfo?.prepaidAmount ?? 0;
  const finalSum = Math.max(
    0,
    payload.totalAmount ?? subtotal - discount - giftCardUsed,
  );

  try {
    const transporter = getSmtpTransporter(smtp);
    const fromEmail = smtp.fromEmail ?? smtp.user!;
    const fromName = smtp.fromName ?? 'Anette Gallery Site';
    const subject = buildEmailSubject(payload, finalSum);
    const text = buildFullNoteText(
      payload,
      subtotal,
      discount,
      giftCardUsed,
      finalSum,
      options.maxmaDiscountInfo,
      options.txid,
    );

    const headers: Record<string, string> = {};
    if (smtp.fromEmail) {
      headers['Reply-To'] = `${payload.customer.fullName?.trim() || 'Покупатель'} <${
        payload.customer.email ?? smtp.fromEmail
      }>`;
    } else if (payload.customer.email) {
      headers['Reply-To'] = `${payload.customer.fullName?.trim() || 'Покупатель'} <${
        payload.customer.email
      }>`;
    }

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: amo.inboxEmail!,
      subject,
      text,
      headers,
    });

    return {
      status: 'ok',
      mode: 'email',
      target: 'amocrm',
      action: 'create-order-lead',
      messageId: info.messageId,
      inboxEmail: amo.inboxEmail!,
      smtpHost: smtp.host!,
      debug: {
        finalSum,
        subtotal,
        discount,
        giftCardUsed,
      },
    };
  } catch (err) {
    return {
      status: 'error',
      mode: 'email',
      target: 'amocrm',
      action: 'create-order-lead',
      inboxEmail: amo.inboxEmail ?? undefined,
      smtpHost: smtp.host ?? undefined,
      reason: 'smtp_send_failed',
      debug: {
        error:
          err instanceof Error
            ? { name: err.name, message: err.message }
            : String(err ?? '').slice(0, 500),
        finalSum,
        subtotal,
        discount,
        giftCardUsed,
      },
    };
  }
}

async function createLeadViaApi(
  payload: CreateOrderPayload,
  options: {
    txid?: string;
    maxmaDiscountInfo?: {
      subtotal: number;
      totalDiscount: number;
      prepaidAmount: number;
      finalTotal: number;
      promoCode?: string;
      giftCardNumber?: string;
      loyaltyApplied?: boolean;
      discountBreakdown?: unknown;
    };
  } = {},
): Promise<{
  status: 'ok' | 'error' | 'stub' | 'degraded';
  mode: 'live' | 'stub';
  target: 'amocrm';
  action: 'create-order-lead';
  leadId?: number;
  contactId?: number;
  pipelineId?: number;
  statusId?: number;
  contactWasCreated?: boolean;
  responseStatusCode?: number;
  responseBody?: unknown;
  reason?: string;
  debug?: Record<string, unknown>;
}> {
  const config = getAppConfig().integrations.amocrm;

  if (!isApiLiveEnabled(config)) {
    return {
      status: 'stub',
      mode: 'stub',
      target: 'amocrm',
      action: 'create-order-lead',
    };
  }

  const pipelineId = config.pipelineId;
  const statusId = config.unsortedStatusId ?? 14339082;
  const subtotal = payload.items.reduce(
    (sum, item) => sum + (item.price ?? 0) * (item.quantity ?? 1),
    0,
  );
  const discount = options.maxmaDiscountInfo?.totalDiscount ?? 0;
  const giftCardUsed = options.maxmaDiscountInfo?.prepaidAmount ?? 0;
  const finalSum = Math.max(
    0,
    payload.totalAmount ?? subtotal - discount - giftCardUsed,
  );

  let contact = { id: 0, wasCreated: false };
  try {
    contact = await findOrCreateContact({
      fullName: payload.customer.fullName,
      phone: payload.customer.phone,
      email: payload.customer.email ?? undefined,
    });
  } catch {
    contact = { id: 0, wasCreated: false };
  }

  const leadName =
    `Заказ с сайта — ${payload.customer.fullName?.trim() || 'Без имени'} — ${new Date().toLocaleString('ru-RU')}`;

  const leadCustomFields: Array<{ field_id: number; values: Array<{ value: unknown }> }> = [];

  if (options.txid && config.orderTxidFieldId) {
    leadCustomFields.push({
      field_id: config.orderTxidFieldId,
      values: [{ value: options.txid }],
    });
  }

  if (payload.promoCode && config.promoCodeFieldId) {
    leadCustomFields.push({
      field_id: config.promoCodeFieldId,
      values: [{ value: payload.promoCode }],
    });
  }

  if (payload.giftCardNumber && config.giftCardFieldId) {
    leadCustomFields.push({
      field_id: config.giftCardFieldId,
      values: [{ value: payload.giftCardNumber }],
    });
  }

  if (payload.deliveryMethod && config.deliveryMethodFieldId) {
    leadCustomFields.push({
      field_id: config.deliveryMethodFieldId,
      values: [{ value: payload.deliveryMethod }],
    });
  }

  const leadsBody: Array<Record<string, unknown>> = [
    {
      name: leadName,
      price: Math.round(finalSum),
      ...(typeof pipelineId === 'number' && pipelineId > 0 ? { pipeline_id: pipelineId } : {}),
      status_id: statusId,
      ...(typeof config.responsibleUserId === 'number' && config.responsibleUserId > 0
        ? { responsible_user_id: config.responsibleUserId }
        : {}),
      ...(leadCustomFields.length > 0 ? { custom_fields_values: leadCustomFields } : {}),
      _embedded: {
        ...(contact.id > 0
          ? {
              contacts: [
                {
                  id: contact.id,
                  is_main: true,
                },
              ],
            }
          : {}),
      },
    },
  ];

  const result = await request('/api/v4/leads', 'create-lead', leadsBody);

  if (result.status !== 'ok') {
    return {
      status: 'error',
      mode: 'live',
      target: 'amocrm',
      action: 'create-order-lead',
      pipelineId: pipelineId ?? undefined,
      statusId: statusId ?? undefined,
      contactId: contact.id || undefined,
      contactWasCreated: contact.wasCreated,
      responseStatusCode: result.responseStatusCode,
      responseBody: result.responseBody,
      reason: 'lead_create_failed',
      debug: {
        leadName,
        finalSum,
        subtotal,
        discount,
        giftCardUsed,
        pipelineId: pipelineId ?? undefined,
        statusId: statusId ?? undefined,
      },
    };
  }

  const responseBody = result.responseBody as {
    _embedded?: { leads?: Array<{ id: number }> };
  };
  const leadId = responseBody?._embedded?.leads?.[0]?.id;

  if (leadId) {
    try {
      const noteText = buildFullNoteText(
        payload,
        subtotal,
        discount,
        giftCardUsed,
        finalSum,
        options.maxmaDiscountInfo,
        options.txid,
      );
      await addNoteToLead(leadId, noteText);
    } catch {
      // Note is nice-to-have — don't fail the whole flow
    }
  }

  return {
    status: 'ok',
    mode: 'live',
    target: 'amocrm',
    action: 'create-order-lead',
    leadId,
    contactId: contact.id || undefined,
    contactWasCreated: contact.wasCreated,
    pipelineId: pipelineId ?? undefined,
    statusId: statusId ?? undefined,
    responseStatusCode: result.responseStatusCode,
    responseBody: result.responseBody,
  };
}

export async function createOrderAsLead(
  payload: CreateOrderPayload,
  options: {
    txid?: string;
    maxmaDiscountInfo?: {
      subtotal: number;
      totalDiscount: number;
      prepaidAmount: number;
      finalTotal: number;
      promoCode?: string;
      giftCardNumber?: string;
      loyaltyApplied?: boolean;
      discountBreakdown?: unknown;
    };
  } = {},
): Promise<{
  status: 'ok' | 'error' | 'stub' | 'degraded';
  mode: 'live' | 'stub' | 'email';
  target: 'amocrm';
  action: 'create-order-lead';
  leadId?: number;
  contactId?: number;
  pipelineId?: number;
  statusId?: number;
  contactWasCreated?: boolean;
  responseStatusCode?: number;
  responseBody?: unknown;
  reason?: string;
  debug?: Record<string, unknown>;
  messageId?: string;
  inboxEmail?: string;
  smtpHost?: string;
  detection?: { mode: AmoMode; reason?: string };
}> {
  const { mode, reason } = detectMode();

  if (mode === 'api') {
    return createLeadViaApi(payload, options);
  }

  if (mode === 'email') {
    return sendLeadViaEmail(payload, options);
  }

  return {
    status: 'stub',
    mode: 'stub',
    target: 'amocrm',
    action: 'create-order-lead',
    reason,
    detection: { mode, reason },
  };
}

export function getAmoCrmStatus() {
  const detection = detectMode();
  const config = getAppConfig().integrations;
  return {
    configured: detection.mode !== 'stub',
    activeMode: detection.mode,
    reason: detection.reason,
    apiConfigured:
      hasRealValue(config.amocrm.baseUrl) && hasRealValue(config.amocrm.accessToken),
    emailConfigured:
      hasRealValue(config.amocrm.inboxEmail) &&
      hasRealValue(config.smtp.host) &&
      hasRealValue(config.smtp.user) &&
      hasRealValue(config.smtp.password),
  };
}
