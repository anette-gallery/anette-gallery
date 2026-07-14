# Debug Session: tilda-maxma-order
- **Status**: [OPEN]
- **Issue**: Заявка из Tilda сохраняется, но заказ не появляется в MAXMA даже для номера, который уже существует в MAXMA.
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-tilda-maxma-order.ndjson

## Reproduction Steps
1. Получить реальный payload свежей заявки из `GET /api/v1/leads`.
2. Воспроизвести `POST /api/v1/webhooks/tilda/order` локально на текущем коде.
3. Сравнить путь: `webhook received -> orderPreview -> customerSync -> createOrder`.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | На проде еще не был активен свежий деплой, поэтому заявка обрабатывалась старым кодом без актуального order-flow. | Med | Low | Partially confirmed: исходная заявка пользователя не дала заказа, но повторный replay того же payload после фикса дал успешный order в MAXMA. |
| B | `customerSync` проходит неуспешно, поэтому заказ до `set-purchase` не доходит. | High | Low | Rejected: replay payload показал `customerSync.status=ok`, `operation=updated`. |
| C | `customerSync` проходит, но `set-purchase` падает уже после него из-за формы payload или ограничений MAXMA. | High | Low | Rejected: replay payload показал `create-order.status=ok`, ticket создан. |
| D | Из payload `Tilda` собирается неполный заказ, и ветка отправки в MAXMA не срабатывает или уходит с некорректными данными. | Med | Low | Rejected: свежий payload дал `orderReady=true`, строка товара и сумма корректные. |
| E | Номер есть в MAXMA визуально, но в API он определяется иначе из-за формата телефона/карты/магазина. | Med | Med | Rejected: replay payload с `+79045501567` успешно обновил клиента и создал заказ. |

## Log Evidence
- `GET /api/v1/leads?limit=3` показал свежий лид пользователя:
  - `createdAt=2026-07-14T13:23:17.073Z`
  - `phone=+7 (904) 550-15-67`
  - `totalAmount=131000`
- Replay того же `rawPayload` в `POST /api/v1/webhooks/tilda/order` вернул:
  - `orderReady=true`
  - `customerSync.status=ok`
  - `customerSync.operation=updated`
  - `order.status=ok`
  - `responseBody.ticket=7c4c52ea-3915-4d3d-af03-8ead2c5034c2`
  - `responseBody.calculationResult.summary.totalDiscount=3930`
- Поддержка MAXMA подтвердила:
  - `/set-purchase` только рассчитывает и резервирует, но не создает видимую покупку;
  - для завершения нужен `POST /confirm-ticket`;
  - покупки `В работе` относятся к другому сценарию через `/set-order`.

## Verification Conclusion
Проблема локализована: код успешно доходил до `MAXMA`, но использовал только `/set-purchase`, который по бизнес-смыслу не создает отображаемую покупку в кабинете. Подготовлен фикс: после успешного `/set-purchase` с полученным `ticket` автоматически вызывается `/confirm-ticket`. Debug-сессия остается открытой до выкладки и пользовательской проверки.
