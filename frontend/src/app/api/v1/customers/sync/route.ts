import { errorResponse, jsonResponse, optionsResponse, readJson } from '@/server/http';
import { syncCustomer } from '@/server/services';
import { parseSyncCustomerPayload } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const payload = parseSyncCustomerPayload(await readJson(request));
    return jsonResponse(await syncCustomer(payload));
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'Не удалось синхронизировать клиента',
    );
  }
}

export async function OPTIONS() {
  return optionsResponse();
}
