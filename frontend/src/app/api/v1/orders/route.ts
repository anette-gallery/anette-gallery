import { errorResponse, jsonResponse, optionsResponse, readJson } from '@/server/http';
import { createOrder } from '@/server/services';
import { parseCreateOrderPayload } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const payload = parseCreateOrderPayload(await readJson(request));
    return jsonResponse(await createOrder(payload));
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'Не удалось создать заказ',
    );
  }
}

export async function OPTIONS() {
  return optionsResponse();
}
