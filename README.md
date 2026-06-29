# Lapaloma Commerce Platform

Монорепозиторий для проекта интеграции `Tilda`, `Maxma` и `1С`.

## Структура

```text
backend/    NestJS API для интеграций и расчета заказов
frontend/   Next.js приложение для каталога, корзины и checkout
database/   схема БД, миграции и служебные материалы
docs/       проектная документация и API-контракты
```

## Технологический стек

- `Next.js` для frontend;
- `NestJS` для backend;
- `PostgreSQL` для служебной базы данных;
- `GitHub` для репозитория и CI;
- `Vercel` для деплоя frontend.

## Локальный запуск

### Frontend

```bash
cd frontend
npm run dev
```

### Backend

```bash
cd backend
npm run start:dev
```

## Документы

- `IMPLEMENTATION_PLAN.md` — этапы работ и архитектурный план;
- `docs/API_CONTRACTS.md` — стартовые API-контракты;
- `docs/DEPLOY_GITHUB_VERCEL.md` — пошаговый деплой через `GitHub` и `Vercel`.

## Деплой

- `frontend` разворачивается в `Vercel`;
- `backend` нужно размещать отдельно, так как это `NestJS` API и внешние интеграции;
- после публикации backend в `frontend` нужно указать `NEXT_PUBLIC_API_BASE_URL`.
