import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { errorResponse, jsonResponse, optionsResponse } from '@/server/http';
import { saveTildaLead } from '@/server/leads';
import { createOrder } from '@/server/services';
import {
  isEmptyTildaLeadPayload,
  normalizeTildaLeadPayload,
  toCreateOrderPayload,
} from '@/server/tilda-webhook';

function appendValue(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
) {
  if (target[key] === undefined) {
    target[key] = value;
    return;
  }

  const current = target[key];
  target[key] = Array.isArray(current) ? [...current, value] : [current, value];
}

async function readWebhookPayload(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';

  if (contentType.includes('application/json')) {
    return await request.json();
  }

  if (
    contentType.includes('multipart/form-data') ||
    contentType.includes('application/x-www-form-urlencoded')
  ) {
    const formData = await request.formData();
    const payload: Record<string, unknown> = {};

    for (const [key, value] of formData.entries()) {
      appendValue(payload, key, typeof value === 'string' ? value : value.name);
    }

    return payload;
  }

  const text = await request.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { rawBody: text };
  }
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );

    return `{${entries
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableSerialize(nestedValue)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function buildTildaOrderTxid(rawPayload: unknown) {
  const fingerprint = createHash('sha256')
    .update(stableSerialize(rawPayload))
    .digest('hex')
    .slice(0, 24);

  return `tilda-${fingerprint}`;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const rawPayload = await readWebhookPayload(request);
    const normalizedPayload = normalizeTildaLeadPayload(rawPayload);
    // #region debug-point D:tilda-webhook-normalized
    (() => {
      const p = '.dbg/tilda-maxma-order.env';
      let u = 'http://127.0.0.1:7777/event';
      let s = 'tilda-maxma-order';
      try {
        const e = readFileSync(p, 'utf8');
        u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
        s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
      } catch {}
      fetch(u, {
        method: 'POST',
        body: JSON.stringify({
          sessionId: s,
          runId: 'pre-fix',
          hypothesisId: 'D',
          location: 'webhooks/tilda/order:POST',
          msg: '[DEBUG] Tilda webhook normalized payload',
          data: {
            customerPhone: normalizedPayload.customer.phone ?? null,
            customerEmail: normalizedPayload.customer.email ?? null,
            itemsCount: normalizedPayload.items.length,
            totalAmount: normalizedPayload.totalAmount,
          },
          ts: Date.now(),
        }),
      }).catch(() => {});
    })();
    // #endregion

    if (isEmptyTildaLeadPayload(normalizedPayload)) {
      return jsonResponse({
        status: 'accepted',
        source: 'tilda-webhook',
        mode: 'validation',
        message:
          'Webhook сохранен. Tilda прислала тестовый запрос без данных заказа, это допустимо на этапе подключения.',
        rawPayload,
      });
    }

    const lead = await saveTildaLead(normalizedPayload, rawPayload);
    const orderPreview = toCreateOrderPayload(normalizedPayload);
    // #region debug-point D:order-preview
    (() => {
      const p = '.dbg/tilda-maxma-order.env';
      let u = 'http://127.0.0.1:7777/event';
      let s = 'tilda-maxma-order';
      try {
        const e = readFileSync(p, 'utf8');
        u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
        s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
      } catch {}
      fetch(u, {
        method: 'POST',
        body: JSON.stringify({
          sessionId: s,
          runId: 'pre-fix',
          hypothesisId: 'D',
          location: 'webhooks/tilda/order:orderPreview',
          msg: '[DEBUG] Tilda order preview prepared',
          data: {
            orderReady: Boolean(orderPreview),
            leadSaved: lead.saved,
            leadId: lead.id ?? null,
          },
          ts: Date.now(),
        }),
      }).catch(() => {});
    })();
    // #endregion
    const orderTxid = orderPreview ? buildTildaOrderTxid(rawPayload) : null;
    const order = orderPreview
      ? await createOrder(orderPreview, { txid: orderTxid! })
      : null;
    // #region debug-point C:tilda-order-result
    (() => {
      const p = '.dbg/tilda-maxma-order.env';
      let u = 'http://127.0.0.1:7777/event';
      let s = 'tilda-maxma-order';
      try {
        const e = readFileSync(p, 'utf8');
        u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
        s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
      } catch {}
      fetch(u, {
        method: 'POST',
        body: JSON.stringify({
          sessionId: s,
          runId: 'pre-fix',
          hypothesisId: 'C',
          location: 'webhooks/tilda/order:result',
          msg: '[DEBUG] Tilda webhook order processing result',
          data: {
            orderTxid,
            orderStatus: order && typeof order === 'object' && 'status' in order ? order.status : null,
            orderAction: order && typeof order === 'object' && 'action' in order ? order.action : null,
            orderSkipped:
              order && typeof order === 'object' && 'orderSkipped' in order
                ? order.orderSkipped
                : null,
          },
          ts: Date.now(),
        }),
      }).catch(() => {});
    })();
    // #endregion

    return jsonResponse({
      status: 'accepted',
      source: 'tilda-webhook',
      mode: 'lead',
      lead,
      orderReady: Boolean(orderPreview),
      orderTxid,
      order,
      normalizedPayload,
      message: orderPreview
        ? 'Заявка из Tilda сохранена и сразу отправлена в MAXMA как заказ в работе.'
        : 'Заявка из Tilda сохранена как лид без полного состава заказа.',
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error
        ? error.message
        : 'Не удалось обработать webhook заказа из Tilda',
    );
  }
}

export async function OPTIONS() {
  return optionsResponse();
}
