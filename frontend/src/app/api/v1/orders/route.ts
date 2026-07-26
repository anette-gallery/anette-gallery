import { errorResponse, jsonResponse, optionsResponse, readJson } from '@/server/http';
import {
  finalizeOrderRequest,
  listRecentOrderRequests,
  saveOrderRequest,
} from '@/server/order-requests';
import { createOrder } from '@/server/services';
import { isDatabaseConfigured } from '@/server/database';
import { parseCreateOrderPayload } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseLimit(request: Request): number {
  const { searchParams } = new URL(request.url);
  const value = searchParams.get('limit');

  if (!value) {
    return 20;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20;
  }

  return Math.min(Math.trunc(parsed), 100);
}

export async function POST(request: Request) {
  let requestLogId: string | undefined;

  try {
    const payload = parseCreateOrderPayload(await readJson(request));
    const requestLog = await saveOrderRequest(payload);
    requestLogId = requestLog.id;

    const result = await createOrder(payload);
    await finalizeOrderRequest(
      requestLogId,
      result,
      typeof result?.status === 'string' ? result.status : 'processed',
    );

    return jsonResponse(result);
  } catch (error) {
    await finalizeOrderRequest(
      requestLogId,
      {
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Не удалось создать заказ',
      },
      'error',
    );

    return errorResponse(
      error instanceof Error ? error.message : 'Не удалось создать заказ',
    );
  }
}

export async function GET(request: Request) {
  const limit = parseLimit(request);
  const orders = await listRecentOrderRequests(limit);

  return jsonResponse({
    status: 'ok',
    source: 'custom-checkout-orders',
    databaseConfigured: isDatabaseConfigured(),
    count: orders.length,
    limit,
    orders,
  });
}

export async function OPTIONS() {
  return optionsResponse();
}
