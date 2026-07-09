import { jsonResponse, optionsResponse } from '@/server/http';
import { getAppInfo } from '@/server/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return jsonResponse(getAppInfo());
}

export async function OPTIONS() {
  return optionsResponse();
}
