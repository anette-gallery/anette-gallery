import { errorResponse, jsonResponse, optionsResponse, readJson } from '@/server/http';
import { validatePromoCode } from '@/server/services';
import { parseCalculateCheckoutPayload } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const payload = parseCalculateCheckoutPayload(await readJson(request));
    return jsonResponse(await validatePromoCode(payload));
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'Не удалось проверить промокод',
    );
  }
}

export async function OPTIONS() {
  return optionsResponse();
}
