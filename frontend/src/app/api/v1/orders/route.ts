import { errorResponse, jsonResponse, optionsResponse, readJson } from '@/server/http';
import {
  finalizeOrderRequest,
  listRecentOrderRequests,
  saveOrderRequest,
} from '@/server/order-requests';
import { createOrder } from '@/server/services';
import { isDatabaseConfigured } from '@/server/database';
import { parseCreateOrderPayload } from '@/server/validation';
import type { OrderItem, OrderRequestListItem } from '@/types/api';

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

function parseStatus(request: Request): string | undefined {
  const { searchParams } = new URL(request.url);
  const value = searchParams.get('status');

  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed;
}

function wantsJson(request: Request): boolean {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format');
  const accept = request.headers.get('accept') ?? '';

  return format === 'json' || accept.includes('application/json');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function getItems(order: OrderRequestListItem): OrderItem[] {
  const rawPayload = order.rawPayload;

  if (
    !rawPayload ||
    typeof rawPayload !== 'object' ||
    !('items' in rawPayload) ||
    !Array.isArray(rawPayload.items)
  ) {
    return [];
  }

  return rawPayload.items.filter(
    (item): item is OrderItem =>
      typeof item === 'object' && item !== null && 'sku' in item && 'quantity' in item,
  );
}

function getMaxmaStatus(order: OrderRequestListItem): string {
  const responsePayload = order.responsePayload;

  if (!responsePayload || typeof responsePayload !== 'object') {
    return order.status;
  }

  if ('status' in responsePayload && typeof responsePayload.status === 'string') {
    return responsePayload.status;
  }

  return order.status;
}

function renderStatus(status: string): string {
  const normalized = status.toLowerCase();
  const tone =
    normalized === 'ok'
      ? 'success'
      : normalized === 'error'
        ? 'error'
        : normalized === 'received'
          ? 'pending'
          : 'default';

  const labels: Record<string, string> = {
    ok: 'Отправлен',
    error: 'Ошибка',
    received: 'Получен',
    processed: 'Обработан',
  };

  const label = labels[normalized] ?? status;

  return `<span class="status ${tone}">${escapeHtml(label)}</span>`;
}

function renderOrdersTable(orders: OrderRequestListItem[], limit: number): string {
  const rows =
    orders.length > 0
      ? orders
          .map((order) => {
            const items = getItems(order);
            const itemsHtml =
              items.length > 0
                ? items
                    .map((item) => {
                      const title = escapeHtml(item.title ?? 'Товар без названия');
                      const sku = escapeHtml(item.sku);

                      return `<div class="item"><strong>${title}</strong><span>Артикул: ${sku} • ${item.quantity} шт. • ${formatCurrency(item.unitPrice)}</span></div>`;
                    })
                    .join('')
                : '<span class="muted">Состав заказа не найден</span>';

            return `
              <tr>
                <td class="date-cell">
                  <div>${escapeHtml(formatDate(order.createdAt))}</div>
                  <div class="muted">ID: ${escapeHtml(order.id.slice(0, 8))}</div>
                </td>
                <td>${renderStatus(getMaxmaStatus(order))}</td>
                <td>
                  <div class="customer">${escapeHtml(order.fullName ?? 'Без имени')}</div>
                  <div class="muted">${escapeHtml(order.phone ?? 'Телефон не указан')}</div>
                  <div class="muted">${escapeHtml(order.email ?? 'Email не указан')}</div>
                </td>
                <td class="items-cell">${itemsHtml}</td>
                <td class="sum-cell">${escapeHtml(formatCurrency(order.totalAmount))}</td>
                <td>
                  <div>${escapeHtml(order.deliveryMethod ?? 'Не указана')}</div>
                  <div class="muted">${escapeHtml(order.comment ?? 'Без комментария')}</div>
                </td>
              </tr>
            `;
          })
          .join('')
      : `
        <tr>
          <td colspan="6" class="empty">Заказов пока нет</td>
        </tr>
      `;

  return `<!doctype html>
  <html lang="ru">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Заказы checkout</title>
      <style>
        :root {
          color-scheme: light;
          --bg: #f6f7f9;
          --card: #ffffff;
          --line: #e6e8ee;
          --text: #20232d;
          --muted: #737887;
          --success-bg: #e7f8ee;
          --success-text: #137a3d;
          --error-bg: #fdeceb;
          --error-text: #c43131;
          --pending-bg: #fff5df;
          --pending-text: #9a6a00;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 32px;
          background: var(--bg);
          color: var(--text);
          font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .wrap {
          max-width: 1480px;
          margin: 0 auto;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 20px;
          margin-bottom: 20px;
        }
        h1 {
          margin: 0 0 6px;
          font-size: 32px;
          line-height: 1.1;
        }
        .sub {
          color: var(--muted);
          font-size: 15px;
        }
        .actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          padding: 0 16px;
          border-radius: 12px;
          border: 1px solid var(--line);
          background: var(--card);
          color: var(--text);
          text-decoration: none;
          font-weight: 600;
        }
        .table-card {
          overflow: hidden;
          border: 1px solid var(--line);
          border-radius: 20px;
          background: var(--card);
          box-shadow: 0 10px 30px rgba(20, 27, 45, 0.04);
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th, td {
          padding: 16px 18px;
          border-bottom: 1px solid var(--line);
          vertical-align: top;
          text-align: left;
        }
        th {
          background: #fafbfc;
          color: var(--muted);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        tr:last-child td {
          border-bottom: 0;
        }
        .date-cell, .sum-cell {
          white-space: nowrap;
        }
        .customer {
          font-weight: 700;
          margin-bottom: 4px;
        }
        .items-cell {
          min-width: 340px;
        }
        .item + .item {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px dashed var(--line);
        }
        .item strong {
          display: block;
          margin-bottom: 4px;
        }
        .item span, .muted {
          color: var(--muted);
        }
        .sum-cell {
          font-size: 16px;
          font-weight: 700;
        }
        .status {
          display: inline-flex;
          align-items: center;
          min-height: 30px;
          padding: 0 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
        }
        .status.success {
          background: var(--success-bg);
          color: var(--success-text);
        }
        .status.error {
          background: var(--error-bg);
          color: var(--error-text);
        }
        .status.pending, .status.default {
          background: var(--pending-bg);
          color: var(--pending-text);
        }
        .empty {
          padding: 48px 16px;
          text-align: center;
          color: var(--muted);
        }
        @media (max-width: 980px) {
          body {
            padding: 16px;
          }
          .header {
            align-items: stretch;
            flex-direction: column;
          }
          .table-card {
            overflow-x: auto;
          }
          table {
            min-width: 980px;
          }
        }
      </style>
    </head>
    <body>
      <div class="wrap">
        <div class="header">
          <div>
            <h1>Заказы checkout</h1>
            <div class="sub">Последние ${orders.length} заказов из кастомного checkout. Лимит: ${limit}.</div>
          </div>
          <div class="actions">
            <a class="button" href="?limit=${limit}">Обновить</a>
            <a class="button" href="?limit=${limit}&format=json">JSON</a>
          </div>
        </div>
        <div class="table-card">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Статус</th>
                <th>Клиент</th>
                <th>Что заказал</th>
                <th>Сумма</th>
                <th>Доставка и комментарий</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </body>
  </html>`;
}

export async function POST(request: Request) {
  let requestLogId: string | undefined;

  try {
    const payload = parseCreateOrderPayload(await readJson(request));
    const requestLog = await saveOrderRequest(payload);
    requestLogId = requestLog.id;

    const result = await createOrder(payload);
    await finalizeOrderRequest(
      requestLogId,
      result,
      typeof result?.status === 'string' ? result.status : 'processed',
    );

    return jsonResponse(result);
  } catch (error) {
    await finalizeOrderRequest(
      requestLogId,
      {
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Не удалось создать заказ',
      },
      'error',
    );

    return errorResponse(
      error instanceof Error ? error.message : 'Не удалось создать заказ',
    );
  }
}

export async function GET(request: Request) {
  const limit = parseLimit(request);
  const status = parseStatus(request);
  const orders = await listRecentOrderRequests({ limit, status });
  const data = {
    status: 'ok',
    source: 'custom-checkout-orders',
    databaseConfigured: isDatabaseConfigured(),
    filter: {
      limit,
      status: status ?? null,
    },
    count: orders.length,
    orders,
  };

  if (wantsJson(request)) {
    return jsonResponse(data);
  }

  return new Response(renderOrdersTable(orders, limit), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}

export async function OPTIONS() {
  return optionsResponse();
}
