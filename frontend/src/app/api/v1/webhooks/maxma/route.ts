import { errorResponse, jsonResponse, optionsResponse } from '@/server/http';
import {
  isMaxmaWebhookAuthorized,
  listRecentMaxmaWebhookEvents,
  readMaxmaWebhookPayload,
  saveMaxmaWebhookEvents,
} from '@/server/maxma-webhook';

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

export async function GET(request: Request) {
  try {
    if (!isMaxmaWebhookAuthorized(request)) {
      return errorResponse('MAXMA webhook authorization failed', 403);
    }

    const limit = parseLimit(request);
    const events = await listRecentMaxmaWebhookEvents(limit);

    return jsonResponse({
      status: 'ok',
      source: 'maxma-webhook-log',
      count: events.length,
      limit,
      events,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error
        ? error.message
        : 'Не удалось получить события webhook из MAXMA',
    );
  }
}

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
