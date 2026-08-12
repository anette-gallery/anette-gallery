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
  buildSearchParams,
  encodeQuery,
  parseJsonOrThrow,
} from '@/server/http';
import { getConfig } from '@/server/config';

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

function ensurePaykeeperCredentials(): PaykeeperCredentials {
  const { paykeeper } = getConfig();
  if (
    !paykeeper.baseUrl ||
    !paykeeper.username ||
    !paykeeper.password ||
    !paykeeper.secret
  ) {
    throw new ApiCallError(
      503,
      'Paykeeper credentials not configured',
      'paykeeper_not_configured',
    );
  }
  return {
    baseUrl: paykeeper.baseUrl,
    username: paykeeper.username,
    password: paykeeper.password,
    secret: paykeeper.secret,
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

export async function createPaykeeperInvoice(
  payload: CreatePaymentPayload & { paymentMethod?: PaymentMethod },
): Promise<CreatePaymentResponse> {
  const paykeeper = ensurePaykeeperCredentials();
  const token = await getPaykeeperToken();

  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiCallError(400, 'Invalid payment amount');
  }

  const clientId =
    (payload.clientId || '').trim() ||
    `order-${payload.orderId}`;

  const params: PaykeeperInvoiceParams = {
    pay_amount: amount.toFixed(2),
    clientid: clientId.substring(0, 255),
    orderid: String(payload.orderId).substring(0, 255),
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
      frontendPublicUrl || `https://${process.env.VERCEL_URL || 'localhost:3000'}`;
    params.notification_url = buildAbsoluteUrl(notifyBase, paykeeper.notifyPath)
      .toString();
  }

  const query = new URLSearchParams({
    token,
  }).toString();
  const url = buildAbsoluteUrl(
    paykeeper.baseUrl,
    `/change/invoice/preview/${query ? `?${query}` : ''}`,
  );

  const body = encodeQuery(params as Record<string, string>);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(paykeeper.username, paykeeper.password),
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      Accept: 'application/json',
    },
    body,
  });
  await assertOkStatus(response, 'paykeeper create-invoice');
  const data = (await parseJsonOrThrow(
    response,
    'paykeeper create-invoice',
  )) as { invoice_id?: string; invoice_url?: string; expiry?: string };
  if (!data?.invoice_id || !data?.invoice_url) {
    throw new ApiCallError(502, 'Paykeeper did not return invoice id/url');
  }
  return {
    status: 'ok',
    invoiceId: String(data.invoice_id),
    paymentUrl: String(data.invoice_url),
    expiresAt: data.expiry ? String(data.expiry) : undefined,
  };
}

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
