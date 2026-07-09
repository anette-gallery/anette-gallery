import { NextResponse } from 'next/server';
import { getAppConfig } from '@/server/config';

function buildCorsHeaders() {
  const { server } = getAppConfig();

  return {
    'Access-Control-Allow-Origin': server.corsOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
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
  message: string,
  status = 400,
  details?: unknown,
) {
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
