# LegalAGI

AI-powered legal document generator для российского законодательства.

## Архитектура

Система работает в два этапа:
1. **Pre-Skeleton этап** (текущая реализация) - сбор информации через диалог с LLM
2. **Skeleton этап** (будущее) - генерация структуры и текста договора

## Технологии

- Next.js 14
- TypeScript
- OpenRouter API для LLM
- JSON Schema для валидации
- JSON Patch для обновления состояния

## Установка

```bash
npm install
```

## Настройка

Создайте `.env.local`:

```env
OPENROUTER_API_KEY=your_api_key_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Примечание:** Модель `google/gemini-2.5-flash` используется по умолчанию и задана в коде. Переменная `OPENROUTER_MODEL` не требуется.


## Запуск

```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000)

## Структура проекта

- `app/` - Next.js приложение и API routes
- `components/` - React компоненты UI
- `backend/` - Бизнес-логика
  - `orchestrator/` - Оркестрация процесса
  - `prompts/` - Промпты для LLM
  - `schemas/` - JSON Schema файлы
  - `storage/` - Хранение сессий
  - `llm/` - Клиент для OpenRouter
- `lib/` - Общие утилиты и типы
- `_DOC/` - Документация
- `_PLAN/` - Планы реализации

## UI Layout

- **2/3 экрана слева** - ResultPane (отображение state, domain, issues)
- **1/3 экрана справа** - ChatPane (диалог с агентом)

## API Endpoints

- `POST /api/session` - Создать новую сессию
- `GET /api/session/[sessionId]` - Получить состояние сессии
- `POST /api/session/[sessionId]` - Отправить сообщение
- `POST /api/session/[sessionId]/step` - Запустить LLM step (для отладки)
