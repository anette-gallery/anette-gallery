import { NextResponse } from 'next/server';
import {
  errorResponse,
  jsonResponse,
  optionsResponse,
  readFormDataOrJson,
} from '@/server/http';
import { logger } from '@/server/logger';
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
      logger.warn('paykeeper notify: signature mismatch', { body });
      return errorResponse(400, {
        status: 'bad_signature',
        message: 'Invalid paykeeper signature',
      });
    }

    const payload = parsePaykeeperNotify(body);
    if (!payload || !payload.orderid) {
      logger.warn('paykeeper notify: invalid payload', { body });
      return errorResponse(400, {
        status: 'bad_payload',
        message: 'Invalid payload from paykeeper',
      });
    }

    const orderId = payload.orderid;
    const existing = await findOrderRequestById(orderId);
    if (!existing) {
      logger.warn('paykeeper notify: order not found', { orderId });
      return errorResponse(404, {
        status: 'not_found',
        message: 'Order not found',
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

    logger.info('paykeeper notify: processed', {
      orderId,
      sum: payload.sum,
      paykeeperId: payload.id,
      paymentStatus,
    });

    return jsonResponse({
      status: 'ok',
      action: 'paykeeper-notify',
      orderId,
      paymentStatus,
    });
  } catch (error) {
    logger.error('paykeeper notify error', { error });
    return errorResponse(500, {
      status: 'error',
      message: 'Internal error processing paykeeper notify',
    });
  }
}
