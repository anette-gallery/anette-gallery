import { errorResponse, jsonResponse, optionsResponse } from '@/server/http';
import {
  isMaxmaWebhookAuthorized,
  readMaxmaWebhookPayload,
  saveMaxmaWebhookEvents,
} from '@/server/maxma-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!isMaxmaWebhookAuthorized(request)) {
      return errorResponse('MAXMA webhook authorization failed', 403);
    }

    const events = await readMaxmaWebhookPayload(request);
    const saved = await saveMaxmaWebhookEvents(events);

    return jsonResponse({
      status: 'accepted',
      source: 'maxma-webhook',
      eventsReceived: events.length,
      saved,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error
        ? error.message
        : 'Не удалось обработать webhook из MAXMA',
    );
  }
}

export async function OPTIONS() {
  return optionsResponse();
}
