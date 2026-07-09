# Frontend / Next.js

## Назначение

Папка `frontend` является основным приложением проекта и содержит:

- пользовательский интерфейс сайта;
- route handlers `Next.js` по пути `/api/v1/*`;
- серверную бизнес-логику интеграций `Maxma`, `1С`, `Tilda`;
- базовое подключение к `PostgreSQL`.

## Локальный запуск

```bash
cd frontend
npm install
npm run dev
```

Локальные адреса:

- `http://localhost:3000` - сайт;
- `http://localhost:3000/api/v1` - API.

## Основные папки

- `src/app` - страницы и route handlers;
- `src/server` - config, validation, integrations, database, services;
- `src/types` - общие типы API;
- `src/lib` - клиентские helper-функции для вызова API.

## Переменные окружения

Базовый шаблон: `frontend/.env.example`.

Ключевые переменные:

- `NEXT_PUBLIC_API_BASE_URL=/api/v1`
- `DATABASE_URL`
- `INTEGRATIONS_MODE=stub|live`
- `MAXMA_*`
- `ONEC_*`
- `TILDA_*`

## Текущий статус

- проект переведен на архитектуру `Next.js only`;
- отдельный backend для деплоя не требуется;
- `npm run lint` и `npm run build` проходят.
