import { errorResponse, jsonResponse, optionsResponse, readJson } from '@/server/http';
import { syncCatalogBatch } from '@/server/services';
import { parseSyncCatalogBatchPayload } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const payload = parseSyncCatalogBatchPayload(await readJson(request));
    return jsonResponse(syncCatalogBatch(payload));
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'Не удалось синхронизировать пакет товаров',
    );
  }
}

export async function OPTIONS() {
  return optionsResponse();
}
