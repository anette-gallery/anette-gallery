import { NextResponse } from 'next/server';
import { getAppConfig } from '@/server/config';

function buildCorsHeaders() {
  const { server } = getAppConfig();

  return {
    'Access-Control-Allow-Origin': server.corsOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Tilda-Webhook-Secret',
  };
}

export function jsonResponse(data: unknown, init: ResponseInit = {}) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...buildCorsHeaders(),
      ...(init.headers ?? {}),
    },
  });
}

export function optionsResponse() {
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(),
  });
}

export function errorResponse(
  messageOrStatus: string | number,
  statusOrMessage?: string | number | unknown,
  maybeDetails?: unknown,
) {
  const isStatusFirst = typeof messageOrStatus === 'number';
  const status = isStatusFirst ? messageOrStatus : (Number(statusOrMessage) || 400);
  const message = isStatusFirst
    ? (typeof statusOrMessage === 'string' ? statusOrMessage : 'Error')
    : String(messageOrStatus);
  const details = isStatusFirst ? maybeDetails : (typeof statusOrMessage !== 'number' ? statusOrMessage : maybeDetails);

  return jsonResponse(
    {
      status: 'error',
      message,
      details,
    },
    { status },
  );
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error('Некорректный JSON в теле запроса');
  }
}

export function encodeQuery(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => {
      const key = encodeURIComponent(String(k));
      const value = encodeURIComponent(String(v ?? ''));
      return `${key}=${value}`;
    })
    .join('&');
}

export function buildSearchParams(
  query: Record<string, unknown> | undefined,
): URLSearchParams {
  const params = new URLSearchParams();
  if (!query) return params;
  for (const [key, raw] of Object.entries(query)) {
    if (raw === undefined || raw === null || raw === '') continue;
    if (Array.isArray(raw)) {
      raw.forEach((v) => {
        if (v === undefined || v === null || v === '') return;
        params.append(key, String(v));
      });
      continue;
    }
    params.append(key, String(raw));
  }
  return params;
}

export function buildAbsoluteUrl(base: string, pathname: string, query?: Record<string, unknown>): URL {
  const baseObj = new URL(pathname, base.endsWith('/') ? base : `${base}/`);
  const params = buildSearchParams(query);
  params.forEach((value, key) => baseObj.searchParams.append(key, value));
  return baseObj;
}

export class ApiCallError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiCallError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function assertOkStatus(
  response: Response,
  requestLabel = 'request',
): Promise<void> {
  if (response.ok) return;
  let bodyText = '';
  try {
    bodyText = await response.text();
  } catch {
    bodyText = '';
  }
  throw new ApiCallError(
    response.status,
    `${requestLabel} failed with HTTP ${response.status}`,
    'http_error',
    { body: bodyText.slice(0, 5000) },
  );
}

export async function parseJsonOrThrow<T = unknown>(
  response: Response,
  label = 'response',
): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    let bodyText = '';
    try {
      bodyText = await response.clone().text();
    } catch {
      bodyText = '';
    }
    throw new ApiCallError(502, `${label} invalid JSON`, 'invalid_json', {
      body: bodyText.slice(0, 5000),
    });
  }
}

export async function readFormDataOrJson(request: Request): Promise<unknown> {
  const header = (request.headers.get('content-type') || '').toLowerCase();
  if (header.includes('application/x-www-form-urlencoded') || header.includes('multipart/form-data')) {
    const form = await request.formData();
    const obj: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      obj[key] = typeof value === 'string' ? value : String(value);
    }
    return obj;
  }
  try {
    return await request.json();
  } catch {
    return {};
  }
}

