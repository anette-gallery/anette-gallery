import { NextResponse } from 'next/server';
import {
  errorResponse,
  jsonResponse,
  optionsResponse,
  readFormDataOrJson,
} from '@/server/http';
import {
  parsePaykeeperNotify,
  verifyPaykeeperNotifySignature,
} from '@/server/integrations/paykeeper';
import {
  findOrderRequestById,
  setOrderRequestPayment,
} from '@/server/order-requests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  try {
    const raw = await readFormDataOrJson(request);
    const body = raw && typeof raw === 'object' ? raw : {};

    if (!verifyPaykeeperNotifySignature(body as Record<string, unknown>)) {
      return errorResponse(400, 'Invalid paykeeper signature', {
        status: 'bad_signature',
      });
    }

    const payload = parsePaykeeperNotify(body);
    if (!payload || !payload.orderid) {
      return errorResponse(400, 'Invalid payload from paykeeper', {
        status: 'bad_payload',
      });
    }

    const orderId = payload.orderid;
    const existing = await findOrderRequestById(orderId);
    if (!existing) {
      return errorResponse(404, 'Order not found', {
        status: 'not_found',
      });
    }

    const rawStatus = (payload.status ?? '').trim().toLowerCase();
    let paymentStatus: 'paid' | 'failed' | 'cancelled' | 'pending' = 'pending';
    let orderStatus: string | undefined;
    if (rawStatus === 'successful' || rawStatus === 'success' || rawStatus === 'paid') {
      paymentStatus = 'paid';
      orderStatus = 'paid';
    } else if (rawStatus === 'failed' || rawStatus === 'failure') {
      paymentStatus = 'failed';
    } else if (rawStatus === 'canceled' || rawStatus === 'cancelled') {
      paymentStatus = 'cancelled';
    }

    await setOrderRequestPayment(orderId, {
      paymentStatus,
      paymentPayload: {
        source: 'paykeeper',
        notify: payload,
        receivedAt: new Date().toISOString(),
      },
      ...(orderStatus ? { status: orderStatus } : {}),
    });

    return jsonResponse({
      status: 'ok',
      action: 'paykeeper-notify',
      orderId,
      paymentStatus,
    });
  } catch (error) {
    return errorResponse(500, 'Internal error processing paykeeper notify', {
      status: 'error',
    });
  }
}
