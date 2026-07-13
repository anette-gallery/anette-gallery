# Текущий Статус Проекта

## Что уже сделано

### Архитектура

- принято решение перейти на схему `Next.js only` без отдельного backend-сервиса;
- серверная логика перенесена в `frontend/src/server`;
- базовые endpoint'ы работают как `Next.js route handlers` в `frontend/src/app/api/v1`.

### API и бизнес-логика

- реализованы endpoint'ы:
  - `GET /api/v1`
  - `GET /api/v1/health`
  - `POST /api/v1/customers/sync`
  - `POST /api/v1/checkout/calculate`
  - `POST /api/v1/checkout/loyalty/apply`
  - `POST /api/v1/checkout/promo-code/validate`
  - `POST /api/v1/checkout/gift-card/validate`
  - `POST /api/v1/orders`
  - `POST /api/v1/webhooks/tilda/order`
  - `POST /api/v1/webhooks/maxma`
  - `GET /api/v1/leads`
  - `POST /api/v1/catalog/sync`
  - `POST /api/v1/catalog/sync/batch`
- добавлена ручная валидация payload вместо `NestJS DTO`;
- сохранены режимы `stub/live` для `Maxma`, `1С`, `Tilda`;
- `Tilda` webhook заказа переведен в сценарий `lead/request`: заявка сохраняется отдельно, даже если сайт пока работает без онлайн-оплаты;
- для `Tilda` добавлено хранение заявок в таблице `lead_requests`;
- для `MAXMA` добавлен отдельный webhook endpoint с поддержкой `HTTP Basic Auth` через env и хранением входящих событий в таблице `maxma_webhook_events`;
- добавлен endpoint просмотра последних заявок, чтобы быстро проверять фактический payload из `Tilda`;
- зафиксированы бизнес-правила скидок и fallback-сценарии.

### Frontend

- инициализирован `Next.js` проект в папке `frontend`;
- настроены стартовая страница и демонстрационный экран `checkout`;
- `frontend/src/lib/api.ts` переведен на локальный `NEXT_PUBLIC_API_BASE_URL=/api/v1`;
- UI теперь обращается к API внутри того же `Next.js` приложения.

### Database и инфраструктура

- подготовлена стартовая схема `PostgreSQL`;
- добавлен базовый серверный слой подключения к БД через `pg`;
- настроены `GitHub Actions`, корневой репозиторий и деплой в `Vercel`;
- подтвержден рабочий frontend-домен: `https://anette-gallery-frontend.vercel.app`.

## Что уже проверено

- `frontend`: `npm run lint` проходит;
- `frontend`: `npm run build` проходит;
- сборка видит все route handlers `/api/v1/*`;
- IDE diagnostics чистые по измененным файлам.

## Зафиксированные правила клиента

- карта лояльности + сертификат: можно;
- промокод + сертификат: можно;
- карта лояльности + промокод: нельзя суммировать;
- скидка применяется раньше сертификата;
- если телефон не найден в `Maxma`, нужно предложить регистрацию через `Telegram`-бота с возможностью отказа;
- если `Maxma` недоступна, заказ должен оформляться без скидок;
- синхронизация каталога между `1С` и `Tilda` работает по правилу `last write wins`;
- товары, исчезнувшие из `1С`, нужно скрывать в `Tilda`.

## На чем остановились

- кодовая база уже переведена на единый `Next.js` API-слой;
- `backend` сохранен только как архив референсной версии и не нужен для деплоя;
- добавлен отдельный webhook endpoint для заказов из `Tilda`, чтобы не смешивать внешний payload `Tilda` и внутренний API заказа;
- подготовлен отдельный webhook endpoint `POST /api/v1/webhooks/maxma` для входящих событий `MAXMA`;
- endpoint принимает `application/json`, поддерживает `HTTP Basic Auth`, умеет принимать одно событие или массив событий и сохраняет их в таблицу `maxma_webhook_events` с дедупликацией по `eventId`;
- текущий практический сценарий по `Tilda`: корзина/форма создает заявку, а не оплаченный заказ;
- следующим шагом можно подключать реальные доступы `Tilda`, `Maxma`, `1С` и заводить боевые webhook/JS-сценарии.

## Что нужно дальше

1. добавить в `Vercel` значения `MAXMA_WEBHOOK_USERNAME` и `MAXMA_WEBHOOK_PASSWORD`;
2. передать в поддержку `MAXMA` webhook URL `https://anette-gallery-frontend.vercel.app/api/v1/webhooks/maxma`;
3. подключить живую `PostgreSQL`;
4. настроить webhook и кастомный JS со стороны `Tilda`;
5. переключить интеграции из `stub` в `live`;
6. при необходимости удалить или архивировать `backend` окончательно после полного подтверждения миграции.
