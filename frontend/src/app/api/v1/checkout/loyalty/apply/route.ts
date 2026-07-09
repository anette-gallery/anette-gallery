import { errorResponse, jsonResponse, optionsResponse, readJson } from '@/server/http';
import { applyLoyalty } from '@/server/services';
import { parseCalculateCheckoutPayload } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const payload = parseCalculateCheckoutPayload(await readJson(request));
    return jsonResponse(await applyLoyalty(payload));
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'Не удалось применить программу лояльности',
    );
  }
}

export async function OPTIONS() {
  return optionsResponse();
}
