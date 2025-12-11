# Быстрый старт

## Шаг 1: Установка зависимостей

```bash
npm install
```

## Шаг 2: Настройка OpenRouter API

1. Получите API ключ на [OpenRouter.ai](https://openrouter.ai/)
2. Создайте файл `.env.local` в корне проекта:
```bash
OPENROUTER_API_KEY=your_api_key_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Шаг 3: Запуск проекта

```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000) в браузере.

## Шаг 4: Использование

1. Введите запрос в чат справа, например:
   - "Сделай NDA между нашей компанией и подрядчиком по российскому праву"
   - "Создай SaaS договор для enterprise клиентов"

2. Отвечайте на вопросы агента по мере их появления

3. Просматривайте сгенерированный документ слева

## Структура проекта

- `app/` - Next.js приложение (страницы и API routes)
- `components/` - React компоненты UI
- `backend/agent/` - Логика агента и пайплайн
- `backend/llm/` - Интеграция с OpenRouter
- `backend/storage/` - In-memory хранилище
- `lib/` - Типы и утилиты

## Примечания

- Для MVP используется in-memory хранилище (данные теряются при перезапуске)
- По умолчанию используется **Auto Model Selection** (`openrouter/auto`) - система автоматически выбирает лучшую модель для каждого запроса
- Чтобы использовать конкретную модель, добавьте `OPENROUTER_MODEL=model-name` в `.env.local`
- Все ошибки отображаются в UI

