import crypto from 'node:crypto';
import {
  type CreatePaymentPayload,
  type CreatePaymentResponse,
  type PaykeeperNotifyPayload,
  type PaymentMethod,
} from '@/types/api';
import {
  ApiCallError,
  assertOkStatus,
  buildAbsoluteUrl,
  encodeQuery,
  parseJsonOrThrow,
} from '@/server/http';
import { getAppConfig, getConfig, hasRealValue } from '@/server/config';

function isStubMode(): boolean {
  return getAppConfig().integrations.mode !== 'live';
}

type PaykeeperTokenResponse = {
  token: string;
};

type PaykeeperInvoiceParams = {
  pay_amount: string;
  clientid: string;
  orderid: string;
  client_email?: string;
  client_phone?: string;
  service_name?: string;
  client_callback_url?: string;
  success_url?: string;
  fail_url?: string;
  notification_url?: string;
  expiry?: string;
};

type PaykeeperCredentials = {
  baseUrl: string;
  username: string;
  password: string;
  secret: string;
  serverCallbackSecret: string | null;
  successUrl: string | null;
  failUrl: string | null;
  notifyPath: string | null;
};

function isPaykeeperConfigured(): boolean {
  const { paykeeper } = getConfig();
  return (
    hasRealValue(paykeeper.baseUrl) &&
    hasRealValue(paykeeper.username) &&
    hasRealValue(paykeeper.password) &&
    hasRealValue(paykeeper.secret)
  );
}

function ensurePaykeeperCredentials(): PaykeeperCredentials {
  const { paykeeper } = getConfig();
  const missing: string[] = [];
  const baseUrl = paykeeper.baseUrl ?? null;
  const username = paykeeper.username ?? null;
  const password = paykeeper.password ?? null;
  const secret = paykeeper.secret ?? null;
  if (!baseUrl) missing.push('PAYKEEPER_BASE_URL');
  if (!username) missing.push('PAYKEEPER_USERNAME');
  if (!password) missing.push('PAYKEEPER_PASSWORD');
  if (!secret) missing.push('PAYKEEPER_SECRET');
  if (missing.length > 0) {
    throw new ApiCallError(
      503,
      `Не настроены реквизиты платежной системы в Vercel. Добавьте переменные: ${missing.join(', ')}.`,
      'paykeeper_not_configured',
      { missingEnv: missing, debug: {
          baseUrlSet: Boolean(baseUrl),
          usernameSet: Boolean(username),
          passwordSet: Boolean(password),
          secretSet: Boolean(secret),
          baseUrl: baseUrl ? `${baseUrl.slice(0, 30)}...` : null,
      } },
    );
  }
  return {
    baseUrl: baseUrl!,
    username: username!,
    password: password!,
    secret: secret!,
    serverCallbackSecret: paykeeper.serverCallbackSecret,
    successUrl: paykeeper.successUrl,
    failUrl: paykeeper.failUrl,
    notifyPath: paykeeper.notifyPath,
  };
}

function basicAuthHeader(username: string, password: string): string {
  const raw = `${username}:${password}`;
  const b64 = Buffer.from(raw, 'utf8').toString('base64');
  return `Basic ${b64}`;
}

async function getPaykeeperToken(): Promise<string> {
  const paykeeper = ensurePaykeeperCredentials();
  const url = buildAbsoluteUrl(paykeeper.baseUrl, '/info/settings/token/');
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: basicAuthHeader(paykeeper.username, paykeeper.password),
      Accept: 'application/json',
    },
  });
  await assertOkStatus(response, 'paykeeper get-token');
  const data = (await parseJsonOrThrow(
    response,
    'paykeeper token',
  )) as PaykeeperTokenResponse;
  if (!data?.token) {
    throw new ApiCallError(502, 'Paykeeper did not return token');
  }
  return data.token;
}

function extractInvoiceIdFromHtml(html: string): string | null {
  if (!html) return null;
  const patterns = [
    /name\s*=\s*["']invoice_id["']\s+value\s*=\s*["']([^"']+)["']/i,
    /invoice_id\s*[:=]\s*["']([^"']+)["']/i,
    /invoiceid\s*[:=]\s*["']([^"']+)["']/i,
    /data-invoice-id\s*=\s*["']([^"']+)["']/i,
    /\/bill\/([A-Za-z0-9_-]+)/i,
    /name\s*=\s*["']invoiceid["']\s+value\s*=\s*["']([^"']+)["']/i,
    /input[^>]*\bid\s*=\s*["']invoice_id["'][^>]*\bvalue\s*=\s*["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function extractInvoiceIdFromAny(obj: unknown): string | null {
  if (obj === null || obj === undefined) return null;
  if (typeof obj === 'string') {
    const trimmed = obj.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return extractInvoiceIdFromAny(parsed) ?? extractInvoiceIdFromHtml(trimmed);
    } catch {
      return extractInvoiceIdFromHtml(trimmed);
    }
  }
  if (typeof obj !== 'object') return null;

  const dict = obj as Record<string, unknown>;

  const directKeys = ['invoice_id', 'invoiceid', 'id', 'invoiceId', 'invoice', 'bill_id'];
  for (const k of directKeys) {
    const v = dict[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }

  const nestedKeys = ['result', 'data', 'response', 'preview', 'invoice', 'payload', 'body'];
  for (const k of nestedKeys) {
    const v = dict[k];
    if (v && typeof v === 'object') {
      const found = extractInvoiceIdFromAny(v);
      if (found) return found;
    }
  }

  for (const v of Object.values(dict)) {
    if (typeof v === 'string') {
      const fromHtml = extractInvoiceIdFromHtml(v);
      if (fromHtml) return fromHtml;
    }
  }

  return null;
}

function computeStubInvoice(payload: CreatePaymentPayload & { paymentMethod?: PaymentMethod }): CreatePaymentResponse {
  const cfg = getConfig();
  const invoiceId = `stub-${payload.orderId}-${Date.now().toString(36)}`;
  const fallback = cfg.frontendPublicUrl || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  const fake = new URL('/checkout/success', fallback);
  fake.searchParams.set('invoice_id', invoiceId);
  fake.searchParams.set('orderid', String(payload.orderId));
  fake.searchParams.set('stub', '1');
  return {
    status: 'ok',
    invoiceId,
    paymentUrl: fake.toString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    stub: true,
    configured: isPaykeeperConfigured(),
  } as CreatePaymentResponse & { stub: boolean; configured: boolean };
}

async function createPaykeeperInvoiceLive(
  payload: CreatePaymentPayload & { paymentMethod?: PaymentMethod },
): Promise<CreatePaymentResponse> {
  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiCallError(400, 'Invalid payment amount');
  }

  const paykeeper = ensurePaykeeperCredentials();

  const token = await getPaykeeperToken();

  const clientId =
    (payload.clientId || '').trim() ||
    `order-${payload.orderId}`;

  const params: PaykeeperInvoiceParams & { token?: string } = {
    pay_amount: amount.toFixed(2),
    clientid: clientId.substring(0, 255),
    orderid: String(payload.orderId).substring(0, 255),
    token,
  };
  if (payload.clientEmail) {
    params.client_email = payload.clientEmail;
  }
  if (payload.clientPhone) {
    params.client_phone = String(payload.clientPhone).replace(/\D+/g, '').substring(0, 30);
  }
  if (payload.description) {
    params.service_name = payload.description.substring(0, 512);
  }
  if (paykeeper.successUrl) {
    params.success_url = paykeeper.successUrl;
  }
  if (paykeeper.failUrl) {
    params.fail_url = paykeeper.failUrl;
  }
  if (paykeeper.notifyPath) {
    const { frontendPublicUrl } = getConfig();
    const notifyBase =
      frontendPublicUrl ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    try {
      params.notification_url = buildAbsoluteUrl(notifyBase, paykeeper.notifyPath).toString();
    } catch {
      const trimmedBase = notifyBase.replace(/\/+$/, '');
      const trimmedPath = paykeeper.notifyPath.replace(/^\/+/, '');
      params.notification_url = `${trimmedBase}/${trimmedPath}`;
    }
  }

  const url = buildAbsoluteUrl(paykeeper.baseUrl, '/change/invoice/preview/');
  const body = encodeQuery(params as Record<string, string>);
  const rawResp = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(paykeeper.username, paykeeper.password),
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      Accept: 'application/json, text/plain, */*',
    },
    body,
  });

  const text = await rawResp.text().catch(() => '');

  let rawData: unknown = { rawText: text.substring(0, 600) };
  try {
    rawData = text ? JSON.parse(text) : null;
  } catch {
    const fromHtml = extractInvoiceIdFromHtml(text);
    if (fromHtml) {
      rawData = { invoice_id: fromHtml, rawText: text.substring(0, 400) };
    }
  }

  if (!rawResp.ok) {
    let msg = `HTTP ${rawResp.status}`;
    if (rawData && typeof rawData === 'object') {
      const d = rawData as Record<string, unknown>;
      if (typeof d.msg === 'string') msg = d.msg;
      else if (typeof d.message === 'string') msg = d.message;
      else if (typeof d.error === 'string') msg = d.error;
    }
    throw new ApiCallError(
      rawResp.status,
      `Paykeeper create-invoice failed: ${msg}`,
      'paykeeper_invoice_create',
      { rawText: text.substring(0, 800) },
    );
  }

  const invoiceId = extractInvoiceIdFromAny(rawData) ?? extractInvoiceIdFromHtml(text);

  if (!invoiceId) {
    const details =
      rawData && typeof rawData === 'object'
        ? JSON.stringify(rawData).slice(0, 600)
        : String(rawData ?? '').slice(0, 600);
    throw new ApiCallError(
      502,
      `Paykeeper did not return invoice id. Response: ${details}`,
      'paykeeper_invoice_missing_id',
      {
        rawText: text.substring(0, 1200),
        httpStatus: rawResp.status,
      },
    );
  }

  const paymentUrl = buildAbsoluteUrl(paykeeper.baseUrl, `/bill/${encodeURIComponent(invoiceId)}/`)
    .toString();
  const dict =
    rawData && typeof rawData === 'object' ? (rawData as Record<string, unknown>) : {};
  const rawExpiry =
    typeof dict.expiry === 'string' || typeof dict.expiry === 'number' ? String(dict.expiry) : undefined;
  return {
    status: 'ok',
    invoiceId: String(invoiceId),
    paymentUrl,
    expiresAt: rawExpiry !== null && rawExpiry !== undefined ? String(rawExpiry) : undefined,
  };
}

export async function createPaykeeperInvoice(
  payload: CreatePaymentPayload & { paymentMethod?: PaymentMethod },
): Promise<CreatePaymentResponse> {
  const stubMode = isStubMode();
  const configured = isPaykeeperConfigured();

  if (stubMode || !configured) {
    return computeStubInvoice(payload);
  }

  try {
    return await Promise.race<CreatePaymentResponse>([
      createPaykeeperInvoiceLive(payload),
      new Promise<CreatePaymentResponse>((_, reject) => {
        const t = setTimeout(() => {
          clearTimeout(t);
          reject(new ApiCallError(504, 'Paykeeper request timed out', 'paykeeper_timeout'));
        }, 15000);
      }),
    ]);
  } catch {
    const fallback = computeStubInvoice(payload);
    return {
      ...fallback,
      degraded: true,
      degradedReason: 'paykeeper-live-failed',
    } as CreatePaymentResponse & { degraded: boolean; degradedReason: string };
  }
}

export { isPaykeeperConfigured };

function paykeeperSign(fields: Record<string, unknown>, secret: string): string {
  const ordered = Object.keys(fields)
    .filter((k) => k !== 'sign' && k !== 'keys')
    .sort();
  const values = ordered.map((k) => {
    const v = fields[k];
    if (v === null || v === undefined) return '';
    return String(v);
  });
  const source = [...values, secret].join('|');
  return crypto.createHash('sha256').update(source, 'utf8').digest('hex');
}

export function verifyPaykeeperNotifySignature(
  body: Record<string, unknown>,
): boolean {
  const paykeeper = getConfig().paykeeper;
  if (!paykeeper.secret && !paykeeper.serverCallbackSecret) {
    return false;
  }
  const sign = (body.sign as string | undefined) ?? '';
  if (!sign) return false;
  const secret = paykeeper.secret || paykeeper.serverCallbackSecret || '';
  const computed = paykeeperSign(body, secret);
  const alt = Buffer.from(computed, 'utf8').toString('base64');
  return (
    crypto.timingSafeEqual(
      Buffer.from(String(sign).toLowerCase(), 'utf8'),
      Buffer.from(String(computed).toLowerCase(), 'utf8'),
    ) ||
    crypto.timingSafeEqual(
      Buffer.from(String(sign), 'utf8'),
      Buffer.from(String(alt), 'utf8'),
    )
  );
}

export function parsePaykeeperNotify(
  raw: unknown,
): PaykeeperNotifyPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  return {
    id: String(data.id ?? ''),
    clientid: String(data.clientid ?? ''),
    orderid: String(data.orderid ?? ''),
    sum: String(data.sum ?? ''),
    client_email: data.client_email ? String(data.client_email) : undefined,
    client_phone: data.client_phone ? String(data.client_phone) : undefined,
    payment_type: data.payment_type ? String(data.payment_type) : undefined,
    paykeeper_account: data.paykeeper_account
      ? String(data.paykeeper_account)
      : undefined,
    status: data.status ? String(data.status) : undefined,
    keys: data.keys ? String(data.keys) : undefined,
    sign: data.sign ? String(data.sign) : undefined,
  };
}
