import { randomUUID } from 'node:crypto';
import { isDatabaseConfigured, query } from '@/server/database';
import type { LeadSaveResult, TildaLeadPayload } from '@/types/api';

let leadRequestsTableEnsured = false;

async function ensureLeadRequestsTable() {
  if (leadRequestsTableEnsured || !isDatabaseConfigured()) {
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS lead_requests (
      id UUID PRIMARY KEY,
      source_system VARCHAR(32) NOT NULL,
      source_channel VARCHAR(32) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'received',
      full_name VARCHAR(255),
      phone VARCHAR(32),
      email VARCHAR(255),
      total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      items_count INT NOT NULL DEFAULT 0,
      delivery_method VARCHAR(255),
      comment TEXT,
      raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      normalized_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_lead_requests_source_system
    ON lead_requests(source_system);
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_lead_requests_created_at
    ON lead_requests(created_at DESC);
  `);

  leadRequestsTableEnsured = true;
}

export async function saveTildaLead(
  payload: TildaLeadPayload,
  rawPayload: unknown,
): Promise<LeadSaveResult> {
  if (!isDatabaseConfigured()) {
    return {
      saved: false,
      source: 'tilda',
      status: 'skipped',
      reason: 'database_not_configured',
    };
  }

  await ensureLeadRequestsTable();

  const id = randomUUID();
  await query(
    `
      INSERT INTO lead_requests (
        id,
        source_system,
        source_channel,
        status,
        full_name,
        phone,
        email,
        total_amount,
        items_count,
        delivery_method,
        comment,
        raw_payload,
        normalized_payload
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb
      )
    `,
    [
      id,
      'tilda',
      'website-form',
      'received',
      payload.customer.fullName ?? null,
      payload.customer.phone ?? null,
      payload.customer.email ?? null,
      payload.totalAmount,
      payload.items.length,
      payload.deliveryMethod ?? null,
      payload.comment ?? null,
      JSON.stringify(rawPayload ?? {}),
      JSON.stringify(payload),
    ],
  );

  return {
    saved: true,
    id,
    source: 'tilda',
    status: 'received',
  };
}
