import { jsonResponse, optionsResponse } from '@/server/http';
import { getHealth } from '@/server/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return jsonResponse(await getHealth());
}

export async function OPTIONS() {
  return optionsResponse();
}
