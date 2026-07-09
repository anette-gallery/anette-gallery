# Lapaloma Commerce Platform

Монорепозиторий проекта интеграции `Tilda`, `Maxma` и `1С` в архитектуре `Next.js only`.

## Структура

```text
frontend/   Next.js приложение: UI + route handlers /api/v1 + серверная логика интеграций
database/   схема БД, служебные SQL-материалы и описание данных
docs/       проектная документация и API-контракты
md/         рабочие заметки, этапы и текущий прогресс
backend/    архив референсной NestJS-версии, не используется для деплоя
```

## Технологический стек

- `Next.js` App Router для интерфейса и API;
- `TypeScript` для UI и серверной логики;
- `PostgreSQL` для служебной базы данных;
- `GitHub` для репозитория и CI;
- `Vercel` для деплоя одного приложения.

## Локальный запуск

```bash
cd frontend
npm install
npm run dev
```

Приложение поднимает страницы и API в одном процессе:

- UI: `http://localhost:3000`
- API: `http://localhost:3000/api/v1`

## Переменные окружения

Основной файл примера: `frontend/.env.example`.

Ключевые группы переменных:

- `NEXT_PUBLIC_API_BASE_URL=/api/v1` для локального обращения фронта к своим route handlers;
- `DATABASE_URL` для PostgreSQL;
- `INTEGRATIONS_MODE=stub|live` для безопасного переключения интеграций;
- `MAXMA_*`, `ONEC_*`, `TILDA_*` для внешних систем.

## Документы

- `IMPLEMENTATION_PLAN.md` — архитектурный план проекта;
- `docs/API_CONTRACTS.md` — API-контракты и бизнес-правила;
- `docs/DEPLOY_GITHUB_VERCEL.md` — деплой через `GitHub` и `Vercel`;
- `md/08_CURRENT_PROGRESS.md` — текущий статус реализации.

## Деплой

- В `Vercel` публикуется только `frontend` как один `Next.js` проект;
- `Next.js route handlers` обслуживают `/api/v1/*` без отдельного backend-сервиса;
- секреты интеграций и `DATABASE_URL` добавляются в Environment Variables проекта `Vercel`.
