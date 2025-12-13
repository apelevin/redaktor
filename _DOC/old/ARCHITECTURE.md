# Архитектура LegalAGI

## Содержание

1. [Обзор](#обзор)
2. [Архитектурные слои](#архитектурные-слои)
3. [Потоки данных](#потоки-данных)
4. [Компоненты системы](#компоненты-системы)
5. [Пайплайн агента](#пайплайн-агента)
6. [Управление состоянием](#управление-состоянием)
7. [Хранилище данных](#хранилище-данных)
8. [Интеграции](#интеграции)
9. [Безопасность и производительность](#безопасность-и-производительность)

---

## Обзор

LegalAGI - это веб-приложение для генерации юридических документов с использованием AI-агента и Human-in-the-Loop (HITL) подхода. Система построена на Next.js 14 с использованием App Router, TypeScript и React.

### Ключевые принципы архитектуры

- **Разделение ответственности**: Четкое разделение между UI, бизнес-логикой и интеграциями
- **State-driven**: Централизованное управление состоянием через AgentState
- **Pipeline-based**: Последовательное выполнение шагов с возможностью паузы для пользовательского ввода
- **Type-safe**: Полная типизация TypeScript для безопасности типов

---

## Архитектурные слои

```
┌─────────────────────────────────────────────────────────┐
│                    Presentation Layer                    │
│  (React Components: DocumentPane, ChatPane, etc.)      │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                    Application Layer                     │
│  (API Routes, State Management, API Client)              │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                    Business Logic Layer                 │
│  (Agent Pipeline, Steps, State Management)             │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                    Integration Layer                     │
│  (LLM Client, Storage)                                  │
└─────────────────────────────────────────────────────────┘
```

### 1. Presentation Layer (UI)

**Расположение**: `components/`, `app/page.tsx`, `app/page.css`

**Ответственность**:
- Отображение пользовательского интерфейса
- Обработка пользовательского ввода
- Визуализация документа и чата

**Основные компоненты**:
- `DocumentPane` - левая панель (2/3 экрана) для отображения документа
- `ChatPane` - правая панель (1/3 экрана) для взаимодействия с агентом
- `DocumentViewer` - компонент для рендеринга структуры документа
- `QuestionForm` - форма для ответа на вопросы агента
- `ChatInput` - поле ввода сообщений

### 2. Application Layer

**Расположение**: `app/api/`, `lib/api-client.ts`, `lib/state.ts`

**Ответственность**:
- Обработка HTTP запросов
- Управление UI состоянием
- Коммуникация между frontend и backend

**Основные компоненты**:
- `app/api/agent/step/route.ts` - API endpoint для выполнения шагов агента
- `lib/api-client.ts` - клиент для взаимодействия с API
- `lib/state.ts` - типы и утилиты для UI состояния

### 3. Business Logic Layer

**Расположение**: `backend/agent/`

**Ответственность**:
- Оркестрация пайплайна агента
- Выполнение шагов генерации документа
- Управление состоянием агента
- Принятие решений о необходимости пользовательского ввода

**Основные компоненты**:
- `pipeline.ts` - оркестратор пайплайна
- `state.ts` - управление состоянием агента
- `steps/` - отдельные шаги пайплайна

### 4. Integration Layer

**Расположение**: `backend/llm/`, `backend/storage/`

**Ответственность**:
- Интеграция с внешними сервисами (OpenRouter)
- Хранение данных (документы, состояние агента)

**Основные компоненты**:
- `backend/llm/openrouter.ts` - клиент для работы с OpenRouter API
- `backend/storage/in-memory.ts` - in-memory хранилище (MVP)

---

## Потоки данных

### Поток создания нового документа

```
User Input
    │
    ▼
[ChatPane] ──userMessage──> [API Client]
    │                            │
    │                            ▼
    │                    [API Route: /api/agent/step]
    │                            │
    │                            ▼
    │                    [Pipeline Orchestrator]
    │                            │
    │                            ▼
    │                    [Mission Interpreter]
    │                            │
    │                            ▼
    │                    [LLM Client] ──> [OpenRouter API]
    │                            │
    │                            ▼
    │                    [Storage] ──save──> [In-Memory Storage]
    │                            │
    │                            ▼
    │                    [AgentStepResult]
    │                            │
    │                            ▼
    └───result──> [UI State] ──> [DocumentPane] ──> [DocumentViewer]
```

### Поток ответа на вопрос (HITL)

```
User Answer
    │
    ▼
[QuestionForm] ──userAnswer──> [API Client]
    │                                │
    │                                ▼
    │                        [API Route]
    │                                │
    │                                ▼
    │                        [Pipeline] ──store answer──> [Storage]
    │                                │
    │                                ▼
    │                        [Current Step] (continues with answer)
    │                                │
    │                                ▼
    │                        [Next Step]
    │                                │
    │                                ▼
    └───result──> [UI State] ──> [DocumentPane]
```

### Поток обновления документа

```
Document Change
    │
    ▼
[DocumentViewer] ──documentChanges──> [API Client]
    │                                        │
    │                                        ▼
    │                                [API Route]
    │                                        │
    │                                        ▼
    │                                [Storage] ──save──> [In-Memory]
    │                                        │
    │                                        ▼
    └───updated document──> [UI State] ──> [DocumentPane]
```

---

## Компоненты системы

### Frontend Components

#### DocumentPane (`components/DocumentPane.tsx`)

**Назначение**: Контейнер для отображения документа

**Props**:
- `document: LegalDocument | null` - документ для отображения
- `totalCost?: number` - общая стоимость запросов
- `lastModel?: string` - последняя использованная модель
- `highlightedSectionId?: string` - ID выделенной секции
- `highlightedClauseId?: string` - ID выделенного пункта

**Функциональность**:
- Отображение заголовка документа
- Отображение стоимости запросов
- Передача данных в DocumentViewer

#### ChatPane (`components/ChatPane.tsx`)

**Назначение**: Контейнер для чата с агентом

**Props**:
- `messages: ChatMessage[]` - история сообщений
- `pendingQuestion?: UserQuestion` - текущий вопрос агента
- `isLoading: boolean` - флаг загрузки
- `onSendMessage: (message: string) => void` - обработчик отправки сообщения
- `onAnswerQuestion: (answer: UserAnswer) => void` - обработчик ответа на вопрос

**Функциональность**:
- Отображение истории чата
- Отображение формы вопроса (если есть)
- Обработка отправки сообщений и ответов

#### DocumentViewer (`components/DocumentViewer.tsx`)

**Назначение**: Рендеринг структуры документа

**Props**:
- `document: LegalDocument | null` - документ
- `highlightedSectionId?: string` - ID выделенной секции
- `highlightedClauseId?: string` - ID выделенного пункта

**Функциональность**:
- Отображение заголовка документа с метаданными
- Рендеринг секций и пунктов
- Подсветка выделенных элементов
- Автопрокрутка к выделенным элементам

#### QuestionForm (`components/QuestionForm.tsx`)

**Назначение**: Форма для ответа на вопросы агента

**Поддерживаемые типы вопросов**:
- `single_choice` - выбор одного варианта
- `multi_choice` - выбор нескольких вариантов
- `free_text` - свободный текст

**Особенности**:
- Поддержка опций с текстовыми полями ввода (`requiresInput: true`)
- Валидация обязательных полей
- Отображение рекомендаций и уровней риска

### Backend Components

#### Pipeline Orchestrator (`backend/agent/pipeline.ts`)

**Назначение**: Координация выполнения шагов пайплайна

**Основные функции**:
- `executePipelineStep(request: AgentStepRequest): Promise<AgentStepResult>`

**Логика работы**:
1. Загрузка или создание состояния агента и документа
2. Обработка ответа пользователя (если есть)
3. Применение изменений документа (если есть)
4. Выполнение текущего шага пайплайна
5. Сохранение обновленного состояния и документа
6. Автоматический переход к следующему шагу (если результат `continue`)

**Обработка результатов**:
- `continue` - автоматически переходит к следующему шагу
- `need_user_input` - останавливается и возвращает вопрос пользователю
- `finished` - завершает работу, возвращает готовый документ

#### Agent State Management (`backend/agent/state.ts`)

**Назначение**: Управление состоянием агента

**Основные функции**:
- `updateAgentStateData(state, data)` - обновление данных состояния
- `updateAgentStateStep(state, step)` - обновление текущего шага
- `updateUsageStats(state, usage)` - обновление статистики использования LLM
- `getNextStep(currentStep)` - получение следующего шага в пайплайне

**Структура AgentState**:
```typescript
interface AgentState {
  documentId: string;           // ID документа
  step: string;                 // Текущий шаг пайплайна
  internalData: {               // Внутренние данные
    mission?: LegalDocumentMission;
    issues?: Issue[];
    skeleton?: DocumentSkeleton;
    clauseRequirements?: ClauseRequirement[];
    stylePreset?: StylePreset;
    totalCost?: number;          // Общая стоимость
    totalTokens?: number;        // Общее количество токенов
    lastModel?: string;          // Последняя использованная модель
    lastAnswer?: UserAnswer;     // Последний ответ пользователя
    [key: string]: any;
  };
}
```

### Pipeline Steps

#### 1. Mission Interpreter (`backend/agent/steps/mission_interpreter.ts`)

**Назначение**: Анализ запроса пользователя и извлечение структурированной информации

**Входные данные**:
- `userMessage: string` - сообщение пользователя
- `agentState: AgentState` - текущее состояние
- `document: LegalDocument | null` - существующий документ (если есть)

**Выходные данные**:
- `LegalDocumentMission` - структурированная информация о документе:
  - `documentType` - тип документа
  - `jurisdiction` - юрисдикция (RU, US, EU, UK)
  - `language` - язык документа
  - `partyA`, `partyB` - стороны договора
  - `businessContext` - бизнес-контекст
  - `userGoals` - цели пользователя
  - `riskTolerance` - толерантность к риску

**Логика**:
1. Если mission уже существует, пропускает шаг
2. Использует LLM для извлечения информации из запроса пользователя
3. Если информации недостаточно, задает вопрос пользователю
4. Сохраняет mission в состоянии агента

#### 2. Issue Spotter (`backend/agent/steps/issue_spotter.ts`)

**Назначение**: Определение юридических вопросов, которые должны быть покрыты документом

**Входные данные**:
- `agentState` с `mission`
- `document` (может быть null)

**Выходные данные**:
- `Issue[]` - список обязательных и опциональных вопросов

**Логика**:
1. Использует чеклисты из `backend/tools/checklists.ts` для базовых вопросов
2. Использует LLM для определения дополнительных вопросов на основе mission
3. Разделяет вопросы на обязательные и опциональные
4. Сохраняет issues в состоянии агента

#### 3. Skeleton Generator (`backend/agent/steps/skeleton_generator.ts`)

**Назначение**: Создание структуры документа (секции)

**Входные данные**:
- `agentState` с `mission` и `issues`
- `document` (может быть null)

**Выходные данные**:
- `DocumentSkeleton` - структура документа с секциями

**Логика**:
1. Определяет обязательные секции на основе типа документа и юрисдикции
2. Использует LLM для определения дополнительных секций на основе issues
3. Создает структуру секций с порядком и заголовками
4. Сохраняет skeleton в состоянии агента

#### 4. Clause Requirements Generator (`backend/agent/steps/clause_requirements_generator.ts`)

**Назначение**: Формирование требований к пунктам документа

**Входные данные**:
- `agentState` с `mission`, `issues`, `skeleton`
- `document` (может быть null)

**Выходные данные**:
- `ClauseRequirement[]` - требования к каждому пункту

**Логика**:
1. Для каждой секции определяет связанные issues
2. Генерирует требования к пунктам на основе issues
3. Может задать вопрос пользователю о лимите ответственности (если требуется)
4. Сохраняет requirements в состоянии агента

#### 5. Style Planner (`backend/agent/steps/style_planner.ts`)

**Назначение**: Определение стиля документа

**Входные данные**:
- `agentState` с `mission`
- `document` (может быть null)

**Выходные данные**:
- `StylePreset` - стиль документа:
  - `family` - семейство стиля (formal, balanced, plain)
  - `formality` - формальность (high, medium, low)
  - `sentenceLength` - длина предложений (long, medium, short)
  - `language` - язык

**Логика**:
1. Определяет стиль на основе типа документа, юрисдикции и бизнес-контекста
2. Сохраняет stylePreset в состоянии агента

#### 6. Clause Generator (`backend/agent/steps/clause_generator.ts`)

**Назначение**: Генерация текста пунктов документа

**Входные данные**:
- `agentState` с `mission`, `skeleton`, `requirements`, `stylePreset`
- `document` (может быть null)

**Выходные данные**:
- `ClauseDraft[]` - сгенерированные пункты документа

**Логика**:
1. Для каждого requirement генерирует текст пункта
2. Использует LLM с учетом stylePreset и requirements
3. Применяет постобработку для правильного форматирования (переносы строк)
4. Создает или обновляет документ с пунктами
5. Сохраняет документ в storage

**Особенности**:
- Постобработка текста для обеспечения правильного форматирования пунктов
- Каждый пункт начинается с новой строки

#### 7. Document Linter (`backend/agent/steps/document_linter.ts`)

**Назначение**: Финальная проверка документа

**Входные данные**:
- `agentState` с полным состоянием
- `document` - сгенерированный документ

**Выходные данные**:
- Результат проверки с возможными вопросами пользователю

**Логика**:
1. Проверяет покрытие обязательных вопросов
2. Ищет потенциальные проблемы и противоречия
3. Если найдены проблемы, задает вопрос пользователю о необходимости исправления
4. Если все в порядке, возвращает `finished`

---

## Пайплайн агента

### Последовательность шагов

```
mission_interpreter
    │
    ▼
issue_spotter
    │
    ▼
skeleton_generator
    │
    ▼
clause_requirements_generator
    │
    ▼
style_planner
    │
    ▼
clause_generator
    │
    ▼
document_linter
    │
    ▼
finished
```

### Типы результатов шагов

#### `continue`
- Шаг выполнен успешно
- Автоматически переходит к следующему шагу
- Может содержать `documentPatch` для обновления документа

#### `need_user_input`
- Требуется ответ пользователя
- Содержит `question: UserQuestion`
- Пайплайн останавливается до получения ответа
- После получения ответа продолжается с того же шага

#### `finished`
- Документ готов
- Содержит полный `document: LegalDocument`
- Пайплайн завершается

### Автоматическое продолжение

Pipeline автоматически продолжает выполнение, если результат шага - `continue` и есть следующий шаг:

```typescript
if (result.type === "continue" && getNextStep(result.state.step)) {
  // Автоматически вызывается следующий шаг
  return executePipelineStep({
    agentState: result.state,
    // ...
  });
}
```

---

## Управление состоянием

### Два уровня состояния

#### 1. UI State (`lib/state.ts`, `app/page.tsx`)

**Расположение**: Frontend (React state)

**Структура**:
```typescript
interface UIState {
  document: LegalDocument | null;
  agentState: AgentState | null;
  pendingQuestion?: UserQuestion;
  chatMessages: ChatMessage[];
  isLoading: boolean;
  error?: string;
  totalCost: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  lastModel?: string;
}
```

**Обновление**:
- Обновляется через `handleAgentResult` при получении результата от API
- Синхронизируется с AgentState из backend

#### 2. Agent State (`backend/agent/state.ts`)

**Расположение**: Backend (хранится в storage)

**Структура**: См. раздел "Agent State Management"

**Обновление**:
- Обновляется на каждом шаге пайплайна
- Сохраняется в storage после каждого шага
- Загружается из storage при каждом запросе

### Синхронизация состояний

```
Frontend UI State ──request──> Backend API
                                    │
                                    ▼
                            Backend Agent State
                                    │
                                    ▼
                            Storage (In-Memory)
                                    │
                                    ▼
Backend Agent State ──response──> Frontend UI State
```

---

## Хранилище данных

### In-Memory Storage (`backend/storage/in-memory.ts`)

**Тип**: In-memory (для MVP)

**Хранимые данные**:
- `documents: Map<string, LegalDocument>` - документы
- `agentStates: Map<string, AgentState>` - состояния агентов

**Методы**:
- `saveDocument(document: LegalDocument): void`
- `getDocument(documentId: string): LegalDocument | undefined`
- `saveAgentState(state: AgentState): void`
- `getAgentState(documentId: string): AgentState | undefined`

**Особенности**:
- Данные теряются при перезапуске сервера
- Подходит для MVP и разработки
- Легко заменить на персистентное хранилище (PostgreSQL, MongoDB и т.д.)

### Миграция на персистентное хранилище

Для миграции на персистентное хранилище:

1. Создать новый класс, реализующий интерфейс Storage
2. Заменить `getStorage()` для использования нового класса
3. Обновить методы для работы с БД

---

## Интеграции

### OpenRouter LLM Client (`backend/llm/openrouter.ts`)

**Назначение**: Интеграция с OpenRouter API для доступа к различным LLM моделям

**Основные методы**:
- `chat(messages, config?)` - базовый вызов LLM
- `chatWithRetry(messages, config?, maxRetries?)` - вызов с повторными попытками
- `chatJSON<T>(messages, config?)` - вызов с парсингом JSON ответа

**Особенности**:
- Поддержка Auto Model Selection (`openrouter/auto`)
- Автоматический выбор лучшей модели для каждого запроса
- Извлечение usage statistics (токены, стоимость)
- Обработка ошибок и retry логика

**Конфигурация**:
- `OPENROUTER_API_KEY` - API ключ (обязательно)
- `OPENROUTER_MODEL` - конкретная модель (опционально, по умолчанию `openrouter/auto`)
- `NEXT_PUBLIC_APP_URL` - URL приложения для заголовков

**Usage Statistics**:
```typescript
interface OpenRouterUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;        // Стоимость в USD
  model?: string;       // Использованная модель
}
```

---

## Безопасность и производительность

### Безопасность

**Текущие меры**:
- API ключи хранятся в переменных окружения
- Валидация входных данных на уровне API routes
- Type-safe типы для предотвращения ошибок

**Рекомендации для production**:
- Добавить аутентификацию пользователей
- Реализовать rate limiting
- Добавить валидацию и санитизацию всех входных данных
- Использовать HTTPS
- Реализовать логирование и мониторинг

### Производительность

**Оптимизации**:
- In-memory storage для быстрого доступа (MVP)
- Автоматическое продолжение пайплайна без лишних запросов
- Кэширование состояния агента

**Рекомендации для масштабирования**:
- Использовать персистентное хранилище с индексами
- Реализовать кэширование результатов LLM запросов
- Добавить очередь для обработки запросов
- Использовать streaming для длинных ответов LLM

### Мониторинг

**Текущий мониторинг**:
- Логирование в консоль на каждом шаге
- Отслеживание стоимости и токенов
- Логирование ошибок

**Рекомендации**:
- Интеграция с системой мониторинга (Sentry, DataDog и т.д.)
- Метрики производительности
- Алерты на ошибки и превышение лимитов

---

## Расширяемость

### Добавление нового шага пайплайна

1. Создать файл в `backend/agent/steps/`
2. Реализовать функцию, возвращающую `AgentStepResult`
3. Добавить case в `pipeline.ts`
4. Обновить `getNextStep()` в `state.ts`

### Добавление нового типа вопроса

1. Расширить `QuestionType` в `lib/types.ts`
2. Добавить обработку в `QuestionForm.tsx`
3. Обновить логику в шагах, которые создают вопросы

### Добавление нового типа документа

1. Добавить тип в `lib/types.ts`
2. Создать чеклист в `backend/tools/checklists.ts`
3. Обновить `skeleton_generator.ts` для поддержки структуры документа

---

## Диаграммы

### Полный поток создания документа

```
┌─────────────┐
│   User      │
│  Input      │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│   ChatPane      │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐      ┌──────────────────┐
│  API Client     │─────>│  /api/agent/step │
└──────┬──────────┘      └────────┬─────────┘
       │                          │
       │                          ▼
       │                  ┌──────────────────┐
       │                  │    Pipeline      │
       │                  └────────┬─────────┘
       │                          │
       │                          ▼
       │                  ┌──────────────────┐
       │                  │ Mission Interp.  │
       │                  └────────┬─────────┘
       │                          │
       │                          ▼
       │                  ┌──────────────────┐
       │                  │   Issue Spotter  │
       │                  └────────┬─────────┘
       │                          │
       │                          ▼
       │                  ┌──────────────────┐
       │                  │Skeleton Generator│
       │                  └────────┬─────────┘
       │                          │
       │                          ▼
       │                  ┌──────────────────┐
       │                  │Clause Req. Gen.  │
       │                  └────────┬─────────┘
       │                          │
       │                          ▼
       │                  ┌──────────────────┐
       │                  │   Style Planner   │
       │                  └────────┬─────────┘
       │                          │
       │                          ▼
       │                  ┌──────────────────┐
       │                  │ Clause Generator │
       │                  └────────┬─────────┘
       │                          │
       │                          ▼
       │                  ┌──────────────────┐
       │                  │ Document Linter  │
       │                  └────────┬─────────┘
       │                          │
       │                          ▼
       └──────────────────────────┘
                  │
                  ▼
         ┌─────────────────┐
         │  DocumentPane    │
         │  DocumentViewer  │
         └─────────────────┘
```

### Структура данных

```
LegalDocument
├── id: string
├── mission: LegalDocumentMission
│   ├── documentType: string
│   ├── jurisdiction: "RU" | "US" | "EU" | "UK"
│   ├── language: "ru" | "en"
│   ├── partyA?: string
│   ├── partyB?: string
│   ├── businessContext?: string
│   ├── userGoals: string[]
│   └── riskTolerance: "low" | "medium" | "high"
├── sections: DocumentSection[]
│   ├── id: string
│   ├── title: string
│   ├── order: number
│   └── clauseIds: string[]
├── clauses: ClauseDraft[]
│   ├── id: string
│   ├── sectionId: string
│   ├── text: string
│   ├── reasoningSummary?: string
│   └── order: number
└── stylePreset: StylePreset
    ├── family: "formal" | "balanced" | "plain"
    ├── formality: "high" | "medium" | "low"
    ├── sentenceLength: "long" | "medium" | "short"
    └── language: "ru" | "en"
```

---

## Заключение

Архитектура LegalAGI построена на принципах модульности, разделения ответственности и расширяемости. Система легко масштабируется и может быть адаптирована для различных сценариев использования.

**Ключевые преимущества архитектуры**:
- Четкое разделение слоев
- Типобезопасность через TypeScript
- Гибкий пайплайн с поддержкой HITL
- Легкая расширяемость
- Централизованное управление состоянием

**Области для улучшения**:
- Миграция на персистентное хранилище
- Добавление аутентификации и авторизации
- Реализация кэширования
- Улучшение обработки ошибок
- Добавление мониторинга и метрик

