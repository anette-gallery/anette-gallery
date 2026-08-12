# Debug Session: maxma-promo-discount
- **Status**: [OPEN]
- **Issue**: В checkout промокод и подарочная карта заведены в MAXMA, но итоговая сумма не меняется.
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-maxma-promo-discount.ndjson

## Reproduction Steps
1. Открыть checkout локально или через локальный API.
2. Передать тестовый товар, телефон и промокод `TEST123` либо тестовую подарочную карту.
3. Проверить, что в ответе MAXMA приходит по `summary`, `promocode`, `giftCards`, `shop`, `rows`.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | MAXMA возвращает скидку в другом поле или формате, и итог считается неверно. | High | Low | Rejected: `summary.totalDiscount=0`, `prepaidAmount=0`, итог 611000 без изменений. |
| B | `shop code / shop name` не совпадает с местом продажи промокода. | High | Low | Confirmed: MAXMA вернула `promocode.error.code=34`, `hint="Promocode is not allowed for this shop"`. |
| C | `calculate` в MAXMA применяет другие правила, чем экран в кабинете. | Med | Med | Inconclusive: для промокода блокер уже найден на уровне shop. |
| D | `rows` уходят в таком виде, что промокод не применяется к строкам заказа. | Med | Low | Rejected for current case: отказ случается на уровне shop до применения к строкам. |
| E | В ответе MAXMA есть явная причина отказа, но UI ее не показывает. | High | Low | Confirmed: промокод `TEST123` дал `code=34`, подарочная карта `TEST123` дала `code=40`. |

## Log Evidence
- Remote `GET /api/v1/orders?format=json` для заказа `a626d430-aa3c-41da-b81b-812f61de0abb` показал:
  - `reservation.payload.calculationQuery.shop.code = 30eb-fa163ea4f66d`
  - `reservation.payload.calculationQuery.shop.name = Галерея "Москва`
  - `reservation.payload.calculationQuery.promocode = TEST123`
  - `reservation.responseBody.calculationResult.promocode.error.code = 34`
  - `reservation.responseBody.calculationResult.promocode.error.hint = Promocode is not allowed for this shop`
- Remote `POST /api/v1/checkout/calculate` c `giftCardNumber=TEST123` показал:
  - `giftCards[0].error.code = 40`
  - `giftCards[0].error.description = Подарочная карта не найдена`

## Verification Conclusion
- Root cause for promo: checkout sends MAXMA `shop = { code: 30eb-fa163ea4f66d, name: "Галерея \"Москва" }`, but `TEST123` is not allowed for that shop.
- Root cause for gift card: `TEST123` is not a real found gift card instance in MAXMA, even if a card template with that name exists in the UI.
