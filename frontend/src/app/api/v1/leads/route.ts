import { jsonResponse, optionsResponse } from '@/server/http';
import { isDatabaseConfigured } from '@/server/database';
import { listRecentLeads } from '@/server/leads';

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
  const limit = parseLimit(request);
  const leads = await listRecentLeads(limit);

  return jsonResponse({
    status: 'ok',
    source: 'tilda-leads',
    databaseConfigured: isDatabaseConfigured(),
    count: leads.length,
    limit,
    leads,
  });
}

export async function OPTIONS() {
  return optionsResponse();
}
