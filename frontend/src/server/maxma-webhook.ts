import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { getAppConfig } from '@/server/config';
import { isDatabaseConfigured, query } from '@/server/database';
import type {
  MaxmaWebhookEvent,
  MaxmaWebhookListItem,
  MaxmaWebhookSaveResult,
} from '@/types/api';

let maxmaWebhookEventsTableEnsured = false;

async function ensureMaxmaWebhookEventsTable() {
  if (maxmaWebhookEventsTableEnsured || !isDatabaseConfigured()) {
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS maxma_webhook_events (
      id UUID PRIMARY KEY,
      event_id VARCHAR(128) NOT NULL UNIQUE,
      event_code VARCHAR(128) NOT NULL,
      event_time TIMESTAMPTZ NOT NULL,
      source_system VARCHAR(32) NOT NULL,
      event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_maxma_webhook_events_event_code
    ON maxma_webhook_events(event_code);
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_maxma_webhook_events_received_at
    ON maxma_webhook_events(received_at DESC);
  `);

  maxmaWebhookEventsTableEnsured = true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectString(
  value: unknown,
  field: string,
  { optional = false }: { optional?: boolean } = {},
) {
  if (value === undefined || value === null || value === '') {
    if (optional) {
      return undefined;
    }

    throw new Error(`Поле "${field}" обязательно`);
  }

  if (typeof value !== 'string') {
    throw new Error(`Поле "${field}" должно быть строкой`);
  }

  const trimmed = value.trim();

  if (!trimmed && !optional) {
    throw new Error(`Поле "${field}" обязательно`);
  }

  return trimmed || undefined;
}

function parseMaxmaWebhookEvent(input: unknown, index: number): MaxmaWebhookEvent {
  if (!isRecord(input)) {
    throw new Error(`Событие #${index + 1} должно быть объектом`);
  }

  const event = expectString(input.event, `events[${index}].event`)!;
  const eventId = expectString(input.eventId, `events[${index}].eventId`)!;
  const eventTime = expectString(input.eventTime, `events[${index}].eventTime`)!;
  const source = expectString(input.source, `events[${index}].source`)!;
  const payload = isRecord(input[event]) ? (input[event] as Record<string, unknown>) : {};

  return {
    event,
    eventId,
    eventTime,
    source,
    payload,
  };
}

export async function readMaxmaWebhookPayload(
  request: Request,
): Promise<MaxmaWebhookEvent[]> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';

  if (!contentType.includes('application/json')) {
    throw new Error('MAXMA webhook должен присылать application/json');
  }

  const body = await request.json();
  const events = Array.isArray(body) ? body : [body];

  if (!events.length) {
    throw new Error('MAXMA webhook пришел без событий');
  }

  return events.map(parseMaxmaWebhookEvent);
}

export function isMaxmaWebhookAuthorized(request: Request): boolean {
  const config = getAppConfig().integrations.maxma;
  const expectedUsername = config.webhookUsername;
  const expectedPassword = config.webhookPassword;

  if (!expectedUsername || !expectedPassword) {
    return true;
  }

  const authorization = request.headers.get('authorization');

  if (!authorization?.startsWith('Basic ')) {
    return false;
  }

  const encoded = authorization.slice('Basic '.length).trim();

  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');

    if (separatorIndex === -1) {
      return false;
    }

    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);

    return username === expectedUsername && password === expectedPassword;
  } catch {
    return false;
  }
}

export async function saveMaxmaWebhookEvents(
  events: MaxmaWebhookEvent[],
): Promise<MaxmaWebhookSaveResult[]> {
  if (!isDatabaseConfigured()) {
    return events.map((event) => ({
      accepted: true,
      duplicate: false,
      eventId: event.eventId,
      event: event.event,
    }));
  }

  await ensureMaxmaWebhookEventsTable();

  const results: MaxmaWebhookSaveResult[] = [];

  for (const event of events) {
    const rows = await query<{ inserted: boolean }>(
      `
        INSERT INTO maxma_webhook_events (
          id,
          event_id,
          event_code,
          event_time,
          source_system,
          event_payload
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        ON CONFLICT (event_id) DO NOTHING
        RETURNING TRUE AS inserted
      `,
      [
        randomUUID(),
        event.eventId,
        event.event,
        event.eventTime,
        event.source,
        JSON.stringify(event.payload),
      ],
    );

    results.push({
      accepted: true,
      duplicate: rows.length === 0,
      eventId: event.eventId,
      event: event.event,
    });
  }

  return results;
}

type MaxmaWebhookEventRow = {
  id: string;
  event_id: string;
  event_code: string;
  event_time: string;
  source_system: string;
  event_payload: unknown;
  received_at: string;
};

function toMaxmaWebhookListItem(row: MaxmaWebhookEventRow): MaxmaWebhookListItem {
  return {
    id: row.id,
    eventId: row.event_id,
    event: row.event_code,
    eventTime: row.event_time,
    source: row.source_system,
    payload: row.event_payload,
    receivedAt: row.received_at,
  };
}

export async function listRecentMaxmaWebhookEvents(
  limit = 20,
): Promise<MaxmaWebhookListItem[]> {
  if (!isDatabaseConfigured()) {
    return [];
  }

  await ensureMaxmaWebhookEventsTable();

  const rows = await query<MaxmaWebhookEventRow>(
    `
      SELECT
        id,
        event_id,
        event_code,
        event_time,
        source_system,
        event_payload,
        received_at
      FROM maxma_webhook_events
      ORDER BY received_at DESC
      LIMIT $1
    `,
    [limit],
  );

  return rows.map(toMaxmaWebhookListItem);
}
