import { errorResponse, jsonResponse, optionsResponse } from '@/server/http';
import { createOrder } from '@/server/services';
import { parseTildaOrderPayload } from '@/server/tilda-webhook';

function appendValue(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
) {
  if (target[key] === undefined) {
    target[key] = value;
    return;
  }

  const current = target[key];
  target[key] = Array.isArray(current) ? [...current, value] : [current, value];
}

async function readWebhookPayload(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';

  if (contentType.includes('application/json')) {
    return await request.json();
  }

  if (
    contentType.includes('multipart/form-data') ||
    contentType.includes('application/x-www-form-urlencoded')
  ) {
    const formData = await request.formData();
    const payload: Record<string, unknown> = {};

    for (const [key, value] of formData.entries()) {
      appendValue(payload, key, typeof value === 'string' ? value : value.name);
    }

    return payload;
  }

  const text = await request.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { rawBody: text };
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const rawPayload = await readWebhookPayload(request);
    let normalizedPayload;

    try {
      normalizedPayload = parseTildaOrderPayload(rawPayload);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Поле "items" должно содержать хотя бы один товар')
      ) {
        return jsonResponse({
          status: 'accepted',
          source: 'tilda-webhook',
          mode: 'validation',
          message:
            'Webhook сохранен. Tilda прислала тестовый запрос без товаров, это допустимо на этапе подключения.',
          rawPayload,
        });
      }

      throw error;
    }

    const result = await createOrder(normalizedPayload);

    return jsonResponse({
      status: 'accepted',
      source: 'tilda-webhook',
      normalizedPayload,
      result,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error
        ? error.message
        : 'Не удалось обработать webhook заказа из Tilda',
    );
  }
}

export async function OPTIONS() {
  return optionsResponse();
}
