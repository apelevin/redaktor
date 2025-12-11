# LegalAGI - Legal Document Workspace

AI-powered legal document workspace with Human-in-the-Loop (HITL) agent for creating, editing, and improving legal documents.

## Описание

LegalAGI - это рабочее место для юристов и фаундеров, которое помогает создавать юридические документы с помощью AI-агента. Агент работает через систему Human-in-the-Loop, задавая важные вопросы в критических точках процесса.

### Основные возможности

- **Split-screen интерфейс**: документ слева (2/3 экрана), чат с агентом справа (1/3 экрана)
- **7-шаговый пайплайн генерации документов**:
  1. Mission Interpreter - анализ запроса пользователя
  2. Issue Spotter - определение юридических вопросов
  3. Skeleton Generator - создание структуры документа
  4. Clause Requirements Generator - формирование требований к пунктам
  5. Style Planner - выбор стиля документа
  6. Clause Generator - генерация текста пунктов
  7. Document Linter - финальная проверка документа
- **HITL (Human In The Loop)**: агент останавливается и задаёт вопросы в критических точках
- **Поддержка различных типов документов**: NDA, SaaS MSA, Service Agreement и др.
- **Множественные юрисдикции**: RU, US, EU, UK

## Технологии

- **Frontend**: Next.js 14, React, TypeScript
- **Backend**: Next.js API Routes
- **LLM Provider**: OpenRouter
- **Storage**: In-memory (для MVP)

## Установка

1. Клонируйте репозиторий:
```bash
git clone <repository-url>
cd LegalAGI
```

2. Установите зависимости:
```bash
npm install
```

3. Создайте файл `.env.local` на основе `.env.local.example`:
```bash
cp .env.local.example .env.local
```

4. Добавьте ваш OpenRouter API ключ в `.env.local`:
```
OPENROUTER_API_KEY=your_api_key_here
```

5. Запустите dev сервер:
```bash
npm run dev
```

6. Откройте [http://localhost:3000](http://localhost:3000) в браузере

## Использование

1. **Начните новый документ**: введите запрос в чат справа, например:
   - "Сделай NDA между нашей компанией и подрядчиком по российскому праву"
   - "Создай SaaS договор для enterprise клиентов"

2. **Отвечайте на вопросы агента**: агент будет задавать вопросы в критических точках:
   - Выбор типа документа и юрисдикции
   - Включение дополнительных модулей
   - Ограничение ответственности
   - Стиль документа

3. **Просматривайте документ**: документ отображается слева и обновляется в реальном времени

4. **Редактируйте вручную**: при необходимости вы можете редактировать документ напрямую

## Структура проекта

```
LegalAGI/
├── app/                    # Next.js App Router
│   ├── api/agent/step/    # API endpoint для агента
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Главная страница
│   └── globals.css        # Глобальные стили
├── components/            # React компоненты
│   ├── DocumentPane.tsx   # Левая панель (документ)
│   ├── ChatPane.tsx       # Правая панель (чат)
│   ├── ChatInput.tsx      # Поле ввода сообщений
│   ├── QuestionForm.tsx   # Форма для ответа на вопросы
│   └── DocumentViewer.tsx # Рендеринг документа
├── lib/                   # Утилиты и типы
│   ├── types.ts           # TypeScript интерфейсы
│   ├── state.ts           # Управление состоянием UI
│   └── api-client.ts      # API клиент
├── backend/               # Backend логика
│   ├── agent/             # Агент и пайплайн
│   │   ├── pipeline.ts    # Orchestrator пайплайна
│   │   ├── state.ts       # Управление состоянием агента
│   │   └── steps/         # Шаги пайплайна
│   ├── llm/               # LLM интеграция
│   │   └── openrouter.ts  # OpenRouter клиент
│   ├── storage/           # Хранилище
│   │   └── in-memory.ts   # In-memory хранилище
│   └── tools/             # Инструменты
│       └── checklists.ts  # Чеклисты для типов документов
└── concept/               # Концепция проекта
```

## Архитектура

### Пайплайн агента

Агент работает через последовательность шагов. На каждом шаге он может:
- **continue** - автоматически перейти к следующему шагу
- **need_user_input** - остановиться и запросить ответ пользователя
- **finished** - завершить работу (документ готов)

### HITL механизм

HITL встроен в пайплайн как равноправный элемент. Агент задаёт вопросы когда:
- Критические юридические/бизнес-выборы (юрисдикция, ответственность, SLA)
- Противоречия или неясности в требованиях
- Высокий риск для стороны пользователя
- Недостаток данных для осмысленной формулировки

### Протокол взаимодействия

Фронтенд отправляет POST запросы на `/api/agent/step` с:
- `userMessage` - сообщение пользователя (для нового запроса)
- `agentState` - текущее состояние агента
- `userAnswer` - ответ на вопрос (если есть)
- `documentChanges` - изменения документа (если пользователь редактировал вручную)

Агент возвращает `AgentStepResult` с обновлённым состоянием, изменениями документа и сообщениями для чата.

## Разработка

### Добавление нового типа документа

1. Добавьте тип в `lib/types.ts`:
```typescript
export type DocumentType = "NDA" | "SaaS_MSA" | "YOUR_TYPE" | ...;
```

2. Создайте чеклист в `backend/tools/checklists.ts`:
```typescript
export const YOUR_TYPE_CHECKLIST: DocumentChecklist = {
  documentType: "YOUR_TYPE",
  requiredIssues: [...],
  optionalIssues: [...],
};
```

3. Обновите `getChecklist()` функцию

4. Добавьте структуру скелета в `skeleton_generator.ts`

### Настройка LLM модели

По умолчанию используется `anthropic/claude-3.5-sonnet`. Чтобы изменить:

1. Обновите `defaultModel` в `backend/llm/openrouter.ts`
2. Или передайте `model` в конфигурацию при вызове `chat()`

## Лицензия

MIT

## Контакты

Для вопросов и предложений создайте issue в репозитории.

