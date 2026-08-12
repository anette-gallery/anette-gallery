import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  errorResponse,
  jsonResponse,
  optionsResponse,
  readJson,
} from '@/server/http';
import { createPaykeeperInvoice } from '@/server/integrations/paykeeper';
import {
  CreatePaymentPayloadSchema,
  type CreatePaymentPayload,
} from '@/types/api';
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
    const parsed = CreatePaymentPayloadSchema.safeParse(
      await readJson<CreatePaymentPayload>(request),
    );
    if (!parsed.success) {
      const issues = parsed.error.flatten?.().fieldErrors ?? {};
      return errorResponse(400, 'Некорректные параметры запроса', issues);
    }

    const payload = parsed.data;
    const order = await findOrderRequestById(payload.orderId);
    if (!order) {
      return errorResponse(404, 'Заказ не найден');
    }

    const invoice = await createPaykeeperInvoice(payload);
    await setOrderRequestPayment(payload.orderId, {
      paymentStatus: 'pending',
      paymentInvoiceId: invoice.invoiceId,
      paymentPayload: {
        provider: 'paykeeper',
        invoiceId: invoice.invoiceId,
        paymentUrl: invoice.paymentUrl,
        expiresAt: invoice.expiresAt ?? null,
        createdAt: new Date().toISOString(),
      },
    });

    return jsonResponse(invoice);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse(400, 'Некорректные параметры запроса', error.flatten?.().fieldErrors ?? error.message);
    }
    const message = error instanceof Error ? error.message : 'Не удалось создать платежную ссылку';
    const status =
      error && typeof error === 'object' && 'status' in error && typeof (error as { status: unknown }).status === 'number'
        ? (error as { status: number }).status
        : 500;
    return errorResponse(status, message);
  }
}
