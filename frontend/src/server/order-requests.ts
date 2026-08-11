import { randomUUID } from 'node:crypto';
import { isDatabaseConfigured, query } from '@/server/database';
import type {
  CreateOrderPayload,
  OrderRequestListItem,
  OrderRequestSaveResult,
} from '@/types/api';

let orderRequestsTableEnsured = false;

async function ensureOrderRequestsTable() {
  if (orderRequestsTableEnsured || !isDatabaseConfigured()) {
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS order_requests (
      id UUID PRIMARY KEY,
      source_channel VARCHAR(32) NOT NULL DEFAULT 'custom-checkout',
      status VARCHAR(32) NOT NULL DEFAULT 'received',
      full_name VARCHAR(255),
      phone VARCHAR(32),
      email VARCHAR(255),
      total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      items_count INT NOT NULL DEFAULT 0,
      delivery_method VARCHAR(255),
      comment TEXT,
      raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_order_requests_created_at
    ON order_requests(created_at DESC);
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_order_requests_phone
    ON order_requests(phone);
  `);

  orderRequestsTableEnsured = true;
}

export async function saveOrderRequest(
  payload: CreateOrderPayload,
): Promise<OrderRequestSaveResult> {
  if (!isDatabaseConfigured()) {
    return {
      saved: false,
      source: 'custom-checkout',
      status: 'skipped',
      reason: 'database_not_configured',
    };
  }

  await ensureOrderRequestsTable();

  const id = randomUUID();
  await query(
    `
      INSERT INTO order_requests (
        id,
        source_channel,
        status,
        full_name,
        phone,
        email,
        total_amount,
        items_count,
        delivery_method,
        comment,
        raw_payload
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb
      )
    `,
    [
      id,
      'custom-checkout',
      'received',
      payload.customer.fullName,
      payload.customer.phone,
      payload.customer.email ?? null,
      payload.totalAmount,
      payload.items.length,
      payload.deliveryMethod ?? null,
      payload.comment ?? null,
      JSON.stringify(payload),
    ],
  );

  return {
    saved: true,
    id,
    source: 'custom-checkout',
    status: 'received',
  };
}

export async function finalizeOrderRequest(
  id: string | undefined,
  response: unknown,
  status: string,
) {
  if (!id || !isDatabaseConfigured()) {
    return;
  }

  await ensureOrderRequestsTable();

  await query(
    `
      UPDATE order_requests
      SET
        status = $2,
        response_payload = $3::jsonb,
        updated_at = NOW()
      WHERE id = $1
    `,
    [id, status, JSON.stringify(response ?? {})],
  );
}

type OrderRequestRow = {
  id: string;
  source_channel: string;
  status: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  total_amount: string | number;
  items_count: number;
  delivery_method: string | null;
  comment: string | null;
  raw_payload: unknown;
  response_payload: unknown;
  created_at: string;
  updated_at: string;
};

function toOrderRequestListItem(row: OrderRequestRow): OrderRequestListItem {
  return {
    id: row.id,
    sourceChannel: row.source_channel,
    status: row.status,
    fullName: row.full_name ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    totalAmount:
      typeof row.total_amount === 'number'
        ? row.total_amount
        : Number(row.total_amount),
    itemsCount: row.items_count,
    deliveryMethod: row.delivery_method ?? undefined,
    comment: row.comment ?? undefined,
    rawPayload: row.raw_payload,
    responsePayload: row.response_payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listRecentOrderRequests(
  limit = 20,
): Promise<OrderRequestListItem[]> {
  if (!isDatabaseConfigured()) {
    return [];
  }

  await ensureOrderRequestsTable();

  const rows = await query<OrderRequestRow>(
    `
      SELECT
        id,
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
        response_payload,
        created_at,
        updated_at
      FROM order_requests
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit],
  );

  return rows.map(toOrderRequestListItem);
}

export async function findOrderRequestById(
  id: string,
): Promise<OrderRequestListItem | null> {
  if (!isDatabaseConfigured() || !id) {
    return null;
  }

  await ensureOrderRequestsTable();

  const rows = await query<OrderRequestRow>(
    `
      SELECT
        id,
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
        response_payload,
        created_at,
        updated_at
      FROM order_requests
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );

  return rows[0] ? toOrderRequestListItem(rows[0]) : null;
}

type AckOrderRequestOptions = {
  status: string;
  onecDocId?: string;
  onecDocNumber?: string;
  note?: string;
};

export async function ackOrderRequest(
  id: string,
  options: AckOrderRequestOptions,
) {
  if (!isDatabaseConfigured() || !id) {
    return;
  }

  await ensureOrderRequestsTable();

  const current = await findOrderRequestById(id);
  const baseResponse =
    current && typeof current.responsePayload === 'object' && current.responsePayload !== null
      ? (current.responsePayload as Record<string, unknown>)
      : {};
  const mergedResponse = {
    ...baseResponse,
    acked: true,
    ackedAt: new Date().toISOString(),
    ackedBy: '1c',
    ...(options.onecDocId ? { onecDocId: options.onecDocId } : {}),
    ...(options.onecDocNumber
      ? { onecDocNumber: options.onecDocNumber }
      : {}),
    ...(options.note ? { onecNote: options.note } : {}),
  };

  await query(
    `
      UPDATE order_requests
      SET
        status = $2,
        response_payload = $3::jsonb,
        updated_at = NOW()
      WHERE id = $1
    `,
    [id, options.status || 'processed', JSON.stringify(mergedResponse)],
  );
}
