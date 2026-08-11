import { errorResponse, jsonResponse, optionsResponse, readJson } from '@/server/http';
import {
  ackOrderRequest,
  findOrderRequestById,
} from '@/server/order-requests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AckOrderRequestInput = {
  status?: string;
  onecDocId?: string;
  onecDocNumber?: string;
  note?: string;
};

function normalizeAckPayload(input: unknown): AckOrderRequestInput {
  if (!input || typeof input !== 'object') {
    return {};
  }

  const data = input as Record<string, unknown>;
  const status = typeof data.status === 'string' ? data.status.trim() : undefined;
  const onecDocId =
    typeof data.onecDocId === 'string' ? data.onecDocId.trim() : undefined;
  const onecDocNumber =
    typeof data.onecDocNumber === 'string'
      ? data.onecDocNumber.trim()
      : undefined;
  const note = typeof data.note === 'string' ? data.note.trim() : undefined;

  return {
    status,
    onecDocId,
    onecDocNumber,
    note,
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id || id.trim().length === 0) {
      return errorResponse('Отсутствует id заказа', 400);
    }

    const existing = await findOrderRequestById(id);

    if (!existing) {
      return errorResponse('Заказ не найден', 404);
    }

    const rawPayload = await readJson(request).catch(() => ({}));
    const payload = normalizeAckPayload(rawPayload);
    const nextStatus = payload.status || 'processed';

    await ackOrderRequest(id, {
      status: nextStatus,
      onecDocId: payload.onecDocId,
      onecDocNumber: payload.onecDocNumber,
      note: payload.note,
    });

    const updated = await findOrderRequestById(id);

    return jsonResponse({
      status: 'ok',
      action: 'order-ack',
      id,
      orderStatus: updated?.status ?? nextStatus,
      onecDocId: payload.onecDocId ?? null,
      onecDocNumber: payload.onecDocNumber ?? null,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'Не удалось подтвердить заказ',
      500,
    );
  }
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return PATCH(request, ctx);
}

export async function OPTIONS() {
  return optionsResponse();
}
