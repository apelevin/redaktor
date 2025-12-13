# План реализации: LegalAGI "до Skeleton" этап

## Обзор

Реализация этапа сбора информации через диалог с LLM-first подходом. Результат: готовность к генерации skeleton договора.

**UI Layout:**
- 2/3 экрана слева — отображение результата (Contract IR Draft, issues, domain)
- 1/3 экрана справа — окно чата (диалог с агентом)

---

## 1. Структура проекта

```
/
├── app/                          # Next.js приложение
│   ├── layout.tsx               # Root layout с разделением 2/3 + 1/3
│   ├── page.tsx                 # Главная страница
│   ├── api/
│   │   └── session/
│   │       ├── route.ts         # POST: создать сессию
│   │       └── [sessionId]/
│   │           ├── route.ts     # GET: получить state, POST: отправить сообщение
│   │           └── step/
│   │               └── route.ts # POST: выполнить LLM step
│   └── globals.css
│
├── components/
│   ├── ResultPane.tsx           # Левая панель (2/3) - отображение state
│   │   ├── DomainView.tsx       # Просмотр domain (JSON tree)
│   │   ├── IssuesList.tsx       # Список issues с фильтрацией
│   │   └── StateMeta.tsx        # Мета-информация (статус, версия)
│   │
│   └── ChatPane.tsx             # Правая панель (1/3) - чат
│       ├── ChatHistory.tsx      # История диалога
│       ├── QuestionForm.tsx      # Форма для ответа на вопрос
│       └── ChatInput.tsx        # Ввод нового сообщения
│
├── backend/
│   ├── orchestrator/
│   │   ├── session-orchestrator.ts  # Session Orchestrator
│   │   ├── llm-step-runner.ts       # LLM Step Runner
│   │   ├── patch-applier.ts         # Patch Applier
│   │   ├── policy-guard.ts         # Policy Guard
│   │   └── gatekeeper.ts           # Gatekeeper
│   │
│   ├── prompts/
│   │   ├── interpret-step.md       # Промпт для INTERPRET шага
│   │   ├── gate-check-step.md      # Промпт для GATE_CHECK шага
│   │   ├── prompt-loader.ts        # Загрузчик промптов с подстановкой переменных
│   │   └── README.md               # Документация по формату промптов
│   │
│   ├── schemas/
│   │   ├── pre_skeleton_state.schema.json
│   │   ├── llm_step_output.schema.json
│   │   └── schema-registry.ts      # Управление версиями схем
│   │
│   ├── storage/
│   │   └── session-storage.ts     # Хранение state по session_id
│   │
│   └── llm/
│       └── openrouter.ts          # Клиент для OpenRouter API
│
├── lib/
│   ├── types.ts                   # TypeScript типы на основе JSON Schema
│   ├── validators.ts              # Валидация по JSON Schema
│   └── json-patch.ts              # Утилиты для работы с JSON Patch
│
└── _DOC/                          # Документация (сохраняется)
```

---

## 2. Типы данных (lib/types.ts)

### 2.1. PreSkeletonState

```typescript
interface PreSkeletonState {
  meta: {
    session_id: string;
    schema_id: string;
    schema_version: string;
    stage: 'pre_skeleton';
    locale: { language: 'ru'; jurisdiction: 'RU' };
    status: 'collecting' | 'gating' | 'ready' | 'blocked';
    created_at: string; // ISO date-time
    updated_at: string;
    state_version: number;
  };
  
  domain: Record<string, unknown>; // Произвольный JSON
  
  issues: Issue[];
  
  dialogue: {
    history: DialogueTurn[];
    asked: AskedQuestion[];
  };
  
  control: {
    limits: {
      max_questions_per_run: number;
      max_loops: number;
      max_history_turns: number;
    };
    checks: {
      require_user_confirmation_for_assumptions: boolean;
    };
    flags: Record<string, unknown>;
  };
  
  gate?: {
    ready_for_skeleton: boolean;
    summary: string;
    blockers?: GateBlocker[];
  };
}

interface Issue {
  id: string;
  key?: string;
  severity: 'critical' | 'high' | 'med' | 'low';
  status: 'open' | 'resolved' | 'dismissed';
  title: string;
  why_it_matters: string;
  missing_or_conflict?: string;
  resolution_hint: string;
  requires_user_confirmation?: boolean;
  evidence?: Array<{ kind: 'turn' | 'fact_path' | 'note'; ref: string }>;
}

interface DialogueTurn {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  at: string; // ISO date-time
}

interface AskedQuestion {
  id: string;
  text: string;
  at: string;
  semantic_fingerprint?: string;
}
```

### 2.2. LLMStepOutput

```typescript
interface LLMStepOutput {
  output_id: string;
  step: 'INTERPRET' | 'GATE_CHECK';
  
  patch: {
    format: 'json_patch' | 'merge_patch';
    ops: JsonPatchOp[] | Record<string, unknown>;
  };
  
  issue_updates?: IssueUpsert[];
  
  next_action: {
    kind: 'ask_user' | 'proceed_to_gate' | 'proceed_to_skeleton' | 'halt_error';
    ask_user?: AskUserAction;
    error?: HaltError;
  };
  
  rationale: string;
  safety?: {
    has_unconfirmed_assumptions?: boolean;
    detected_conflict?: boolean;
    repeat_question_risk?: boolean;
  };
  observations?: string[];
}

interface AskUserAction {
  question_id?: string;
  question_text: string;
  answer_format: 'free_text' | 'choices';
  choices?: Choice[];
  why_this_question?: string;
  links_to_issue_ids?: string[];
}

interface Choice {
  id: string;
  label: string;
  value: string | number | boolean;
}
```

---

## 3. Модули backend

### 3.1. Session Orchestrator (`backend/orchestrator/session-orchestrator.ts`)

**Ответственность:**
- Принимает вход пользователя
- Загружает текущий state из storage
- Запускает LLM Step Runner
- Применяет patch через Patch Applier
- Проверяет Policy Guard
- Сохраняет обновленный state
- Возвращает next_action для фронта

**Основной метод:**
```typescript
async function processUserMessage(
  sessionId: string,
  userMessage: string
): Promise<{ state: PreSkeletonState; nextAction: NextAction }>
```

### 3.2. LLM Step Runner (`backend/orchestrator/llm-step-runner.ts`)

**Ответственность:**
- Формирует prompt из state + последнее сообщение + схемы
- Вызывает LLM через OpenRouter
- Валидирует ответ по `llm_step_output.schema.json`
- Возвращает структурированный LLMStepOutput

**Методы:**
```typescript
async function runInterpretStep(
  state: PreSkeletonState,
  lastMessage: string
): Promise<LLMStepOutput>

async function runGateCheckStep(
  state: PreSkeletonState
): Promise<LLMStepOutput>
```

**Промпт для INTERPRET:**
Промпт хранится в `backend/prompts/interpret-step.md` и загружается через `prompt-loader.ts`.

Пример содержимого `interpret-step.md`:
```markdown
# INTERPRET Step Prompt

Ты — юрист, специализирующийся на российском законодательстве.
Твоя задача — извлечь факты из сообщения пользователя и обновить состояние договора.

## Текущее состояние

### Domain
{{domain_json}}

### Issues
{{issues_json}}

### Последние сообщения диалога
{{recent_history}}

## Последнее сообщение пользователя

{{last_message}}

## Инструкции

1. Извлеки факты из сообщения и обнови domain через patch
2. Обнови issues (добавь новые, закрой решенные)
3. Определи следующий шаг:
   - ask_user: если нужно уточнить что-то критичное
   - proceed_to_gate: если кажется, что информации достаточно
4. В rationale объясни свои действия

## Схема ответа

Верни JSON согласно схеме llm_step_output.schema.json:
{{llm_output_schema}}
```

**Загрузка промпта:**
```typescript
import { loadPrompt } from '@/backend/prompts/prompt-loader';

const prompt = await loadPrompt('interpret-step.md', {
  domain_json: JSON.stringify(state.domain, null, 2),
  issues_json: JSON.stringify(state.issues, null, 2),
  recent_history: formatDialogueHistory(state.dialogue.history.slice(-5)),
  last_message: lastMessage,
  llm_output_schema: JSON.stringify(llmOutputSchema, null, 2)
});
```

### 3.3. Patch Applier (`backend/orchestrator/patch-applier.ts`)

**Ответственность:**
- Применяет JSON Patch или Merge Patch к state
- Защищает от перетирания истории (dialogue.history только append)
- Инкрементирует state_version
- Обновляет updated_at

**Метод:**
```typescript
function applyPatch(
  state: PreSkeletonState,
  patch: LLMStepOutput['patch']
): PreSkeletonState
```

### 3.4. Policy Guard (`backend/orchestrator/policy-guard.ts`)

**Ответственность:**
- Дедупликация вопросов (проверка semantic_fingerprint)
- Защита подтвержденных фактов от изменения
- Проверка лимитов (max_questions_per_run, max_loops)
- Обнаружение попыток "придумать" значения

**Методы:**
```typescript
function checkQuestionDeduplication(
  state: PreSkeletonState,
  question: AskUserAction
): boolean

function checkLimits(
  state: PreSkeletonState
): { allowed: boolean; reason?: string }

function protectConfirmedFacts(
  state: PreSkeletonState,
  patch: LLMStepOutput['patch']
): LLMStepOutput['patch']
```

### 3.5. Gatekeeper (`backend/orchestrator/gatekeeper.ts`)

**Ответственность:**
- Запускает LLM шаг GATE_CHECK
- Проверяет готовность к skeleton по категориям:
  - Роли сторон определены
  - Предмет определен
  - Коммерческая модель определена
  - Сроки/события определены
  - Нет критических конфликтов
  - Критические assumptions подтверждены

**Метод:**
```typescript
async function checkGate(
  state: PreSkeletonState
): Promise<{ ready: boolean; summary: string; blockers?: GateBlocker[] }>
```

**Промпт для GATE_CHECK:**
Промпт хранится в `backend/prompts/gate-check-step.md`.

Пример содержимого `gate-check-step.md`:
```markdown
# GATE_CHECK Step Prompt

Проверь готовность состояния к генерации skeleton договора.

## Категории для проверки

1. Роли сторон (кто кому что обязан)
2. Предмет сделки (что является объектом)
3. Коммерческая модель (деньги/оплата/цена)
4. Сроки/события исполнения
5. Отсутствие критических конфликтов
6. Подтверждение критических assumptions

## Текущее состояние

{{state_json}}

## Требования к ответу

Верни JSON согласно схеме llm_step_output.schema.json с patch, который обновит gate:
- ready_for_skeleton: true/false
- summary: краткое объяснение
- blockers: массив критических проблем (если ready=false)
```

---

## 4. API Endpoints

### 4.1. POST `/api/session`

Создает новую сессию.

**Request:**
```json
{
  "initial_message": "договор аренды автомобиля"
}
```

**Response:**
```json
{
  "session_id": "uuid",
  "state": { /* PreSkeletonState */ },
  "next_action": {
    "kind": "ask_user",
    "ask_user": { /* AskUserAction */ }
  }
}
```

### 4.2. GET `/api/session/[sessionId]`

Получает текущее состояние сессии.

**Response:**
```json
{
  "state": { /* PreSkeletonState */ },
  "next_action": { /* NextAction */ }
}
```

### 4.3. POST `/api/session/[sessionId]`

Отправляет сообщение пользователя и обрабатывает его.

**Request:**
```json
{
  "message": "текст ответа пользователя",
  "answer_to_question_id": "question_id" // опционально
}
```

**Response:**
```json
{
  "state": { /* обновленный PreSkeletonState */ },
  "next_action": { /* NextAction */ }
}
```

### 4.4. POST `/api/session/[sessionId]/step`

Принудительно запускает LLM step (для отладки).

**Request:**
```json
{
  "step": "INTERPRET" | "GATE_CHECK"
}
```

---

## 5. UI Компоненты

### 5.1. Layout (app/layout.tsx)

```tsx
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <div style={{ display: 'flex', height: '100vh' }}>
          <div style={{ width: '66.66%', overflow: 'auto' }}>
            {/* ResultPane */}
          </div>
          <div style={{ width: '33.33%', borderLeft: '1px solid #ddd' }}>
            {/* ChatPane */}
          </div>
        </div>
      </body>
    </html>
  );
}
```

### 5.2. ResultPane (components/ResultPane.tsx)

**Отображает:**
- Мета-информация (статус, версия, готовность)
- Domain (JSON tree с возможностью раскрытия)
- Issues (список с фильтрацией по severity/status)
- Gate status (если есть)

**Компоненты:**
- `StateMeta.tsx` — статус, версия, даты
- `DomainView.tsx` — JSON tree viewer
- `IssuesList.tsx` — список issues с фильтрами

### 5.3. ChatPane (components/ChatPane.tsx)

**Отображает:**
- История диалога (dialogue.history)
- Текущий вопрос (если next_action.kind === 'ask_user')
- Форма для ответа

**Компоненты:**
- `ChatHistory.tsx` — история сообщений
- `QuestionForm.tsx` — форма для ответа (free_text или choices)
- `ChatInput.tsx` — ввод нового сообщения

---

## 6. Схемы (backend/schemas/)

### 6.1. JSON Schema файлы

- `pre_skeleton_state.schema.json` — из json.md
- `llm_step_output.schema.json` — из json.md

### 6.2. Schema Registry (backend/schemas/schema-registry.ts)

```typescript
interface SchemaRecord {
  schema_id: string;
  schema_version: string;
  compatibility: 'backward_compatible' | 'breaking';
  schema: object; // JSON Schema
}

const SCHEMA_REGISTRY: SchemaRecord[] = [
  {
    schema_id: 'schema://legalagi/pre_skeleton_state/1.0.0',
    schema_version: '1.0.0',
    compatibility: 'backward_compatible',
    schema: require('./pre_skeleton_state.schema.json')
  },
  // ...
];

export function getSchema(schemaId: string, version?: string): SchemaRecord;
export function validate(data: unknown, schemaId: string): ValidationResult;
```

### 6.3. Prompt Loader (backend/prompts/prompt-loader.ts)

**Ответственность:**
- Загрузка промптов из файлов `.md`
- Подстановка переменных (шаблонизация)
- Кэширование промптов для производительности

**Методы:**
```typescript
interface PromptVariables {
  [key: string]: string | number | boolean;
}

/**
 * Загружает промпт из файла и подставляет переменные
 */
async function loadPrompt(
  filename: string,
  variables: PromptVariables
): Promise<string>

/**
 * Загружает промпт без подстановки (raw)
 */
async function loadPromptRaw(filename: string): Promise<string>

/**
 * Валидирует наличие всех переменных в промпте
 */
function validatePromptVariables(
  prompt: string,
  variables: PromptVariables
): { valid: boolean; missing: string[] }
```

**Формат переменных в промптах:**
- `{{variable_name}}` — подстановка значения
- `{{variable_name|default}}` — с дефолтным значением
- `{{#if condition}}...{{/if}}` — условные блоки (опционально, для сложных случаев)

**Пример использования:**
```typescript
import { loadPrompt } from '@/backend/prompts/prompt-loader';

const prompt = await loadPrompt('interpret-step.md', {
  domain_json: JSON.stringify(state.domain, null, 2),
  issues_json: JSON.stringify(state.issues, null, 2),
  last_message: userMessage,
  llm_output_schema: JSON.stringify(schema, null, 2)
});
```

### 6.4. Структура папки prompts

```
backend/prompts/
├── README.md                    # Документация по формату промптов
├── interpret-step.md            # Промпт для INTERPRET шага
├── gate-check-step.md           # Промпт для GATE_CHECK шага
├── prompt-loader.ts             # Загрузчик промптов
└── templates/                   # Опционально: шаблоны для разных случаев
    ├── interpret-basic.md
    └── interpret-detailed.md
```

**README.md должен содержать:**
- Описание формата промптов
- Список доступных переменных для каждого промпта
- Примеры использования
- Правила версионирования промптов

---

## 7. Storage (backend/storage/session-storage.ts)

**Ответственность:**
- Хранение state по session_id
- In-memory для MVP (можно заменить на БД позже)

**Методы:**
```typescript
function getState(sessionId: string): PreSkeletonState | null;
function saveState(sessionId: string, state: PreSkeletonState): void;
function deleteState(sessionId: string): void;
```

---

## 8. Приоритет реализации

### Фаза 1: Базовая инфраструктура (Критично)
1. ✅ Создать структуру проекта
2. ✅ Типы TypeScript на основе JSON Schema
3. ✅ JSON Schema файлы
4. ✅ Schema Registry
5. ✅ Session Storage (in-memory)
6. ✅ LLM клиент (OpenRouter)
7. ✅ Prompt Loader (загрузка и шаблонизация промптов)
8. ✅ Промпты для INTERPRET и GATE_CHECK шагов

### Фаза 2: Core модули (Критично)
1. ✅ Patch Applier
2. ✅ LLM Step Runner (INTERPRET)
3. ✅ Session Orchestrator
4. ✅ API endpoints (создание сессии, отправка сообщения)

### Фаза 3: UI (Высокий)
1. ✅ Layout с разделением 2/3 + 1/3
2. ✅ ChatPane (история, форма вопроса)
3. ✅ ResultPane (domain, issues, meta)

### Фаза 4: Политики и Gate (Средний)
1. ✅ Policy Guard
2. ✅ Gatekeeper (GATE_CHECK)
3. ✅ Дедупликация вопросов
4. ✅ Защита подтвержденных фактов

### Фаза 5: Улучшения (Низкий)
1. ✅ Semantic fingerprint для дедупликации
2. ✅ Trace логирование
3. ✅ Миграции схем
4. ✅ Персистентное хранилище (БД)

---

## 9. Технические детали

### 9.1. JSON Patch библиотека

Использовать `fast-json-patch` для применения JSON Patch операций.

```typescript
import { applyPatch } from 'fast-json-patch';
```

### 9.2. JSON Schema валидация

Использовать `ajv` для валидации по JSON Schema.

```typescript
import Ajv from 'ajv';
const ajv = new Ajv();
```

### 9.3. LLM промпты

**Хранение:**
- Все промпты хранятся в `backend/prompts/*.md`
- Используется шаблонизация с переменными `{{variable_name}}`
- Промпты загружаются через `prompt-loader.ts`

**Структура промпта:**
- Заголовок с описанием шага
- Контекст (текущий state, история)
- Инструкции
- Требования к формату ответа (ссылка на схему)
- Примеры (few-shot, опционально)

**Переменные для подстановки:**
- `{{domain_json}}` — JSON domain из state
- `{{issues_json}}` — JSON массив issues
- `{{recent_history}}` — последние N сообщений диалога
- `{{last_message}}` — последнее сообщение пользователя
- `{{state_json}}` — полный state (для gate-check)
- `{{llm_output_schema}}` — JSON Schema для валидации ответа

**Версионирование:**
- Промпты можно версионировать через суффиксы: `interpret-step-v1.md`, `interpret-step-v2.md`
- В `prompt-loader.ts` можно указать версию при загрузке

### 9.4. Обработка ошибок

- Валидация ответа LLM: если невалидный — повтор с исправлением (max 2 попытки)
- Ошибки применения patch: откат к предыдущей версии state
- Ошибки LLM API: retry с exponential backoff

---

## 10. Определение Done для V1

✅ Система стабильно работает для 10-20 разных миссий
✅ Вопросы не повторяются и конкретные
✅ Issues отражают реальные проблемы и закрываются вопросами
✅ Gate корректно определяет готовность к skeleton
✅ UI отображает state и позволяет вести диалог
✅ Все данные сохраняются и воспроизводимы

---

## 11. Следующие этапы (после V1)

- Генерация skeleton на основе готового state
- Генерация текста пунктов договора
- Финальная валидация и линтинг
- Экспорт в различные форматы (DOCX, PDF)
