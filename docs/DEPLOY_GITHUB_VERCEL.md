# Деплой через GitHub и Vercel

## Что публикуем

- `frontend` публикуется в `Vercel`;
- `backend` публикуется отдельно на любом Node.js-хостинге;
- `database` и `docs` остаются в монорепозитории.

Важно:

- `Vercel` не должен быть основным хостингом для текущего `NestJS` backend, если планируется стабильная интеграция с `Maxma`, `1С`, webhook и фоновые задачи;
- для `Vercel` подключаем только папку `frontend`.

## 1. Создать репозиторий на GitHub

Создай новый пустой репозиторий без `README`, например:

```text
tilda-1c-maxma
```

После создания понадобится HTTPS URL вида:

```text
https://github.com/<github-user>/<repo-name>.git
```

## 2. Первый push в GitHub

В корне проекта выполни:

```bash
git add .
git commit -m "Initial project setup"
git branch -M main
git remote add origin https://github.com/<github-user>/<repo-name>.git
git push -u origin main
```

Если `remote origin` уже существует, вместо `git remote add origin ...` используй:

```bash
git remote set-url origin https://github.com/<github-user>/<repo-name>.git
```

## 3. Подключить репозиторий в Vercel

В `Vercel`:

1. Нажми `Add New -> Project`
2. Выбери импорт из `GitHub`
3. Подключи репозиторий
4. В настройках проекта укажи:

```text
Framework Preset: Next.js
Root Directory: frontend
```

Если `Vercel` сам определит `Next.js`, это нормально.

## 4. Переменные окружения для frontend

В `Vercel -> Project Settings -> Environment Variables` добавь:

```text
NEXT_PUBLIC_API_BASE_URL=https://<backend-domain>/api/v1
```

На старте можно временно использовать тестовый backend URL.

## 5. Что нужно для backend

`backend` нужно развернуть отдельно. Для него потребуются:

- `DATABASE_URL`
- `CORS_ORIGIN`
- `FRONTEND_PUBLIC_URL`
- `INTEGRATIONS_MODE`
- `MAXMA_*`
- `ONEC_*`
- `TILDA_*`

Минимальный пример:

```text
PORT=4000
CORS_ORIGIN=https://<tilda-or-frontend-domain>
FRONTEND_PUBLIC_URL=https://<frontend-domain>
INTEGRATIONS_MODE=stub
DATABASE_URL=postgresql://...
MAXMA_API_URL=...
MAXMA_API_KEY=...
ONEC_API_URL=...
ONEC_API_LOGIN=...
ONEC_API_PASSWORD=...
TILDA_API_URL=...
TILDA_API_KEY=...
TILDA_WEBHOOK_SECRET=...
```

## 6. Что вставлять в Tilda после публикации backend

Когда backend будет доступен по публичному домену, для webhook `Tilda` можно использовать URL вида:

```text
https://<backend-domain>/api/v1/webhooks/tilda/order
```

Если потребуется отдельный endpoint для клиента:

```text
https://<backend-domain>/api/v1/webhooks/tilda/customer
```

## 7. Рекомендуемый порядок

1. Создать пустой репозиторий в `GitHub`
2. Выполнить первый `push`
3. Импортировать репозиторий в `Vercel`
4. Указать `Root Directory = frontend`
5. Добавить `NEXT_PUBLIC_API_BASE_URL`
6. Отдельно развернуть `backend`
7. После этого подключать `Tilda` webhook и `Maxma`
