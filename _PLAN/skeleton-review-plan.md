# План реализации: Skeleton Review (Шаг 3)

## Обзор

Этап **SKELETON_REVIEW** позволяет пользователю настраивать структуру skeleton через UX-вопросы (чекбоксы, радиокнопки, поля ввода) перед финальной генерацией текста договора.

**Цель**: Дать пользователю возможность быстро корректировать структуру договора (включать/исключать разделы, выбирать варианты детализации) без необходимости редактировать skeleton вручную.

---

## Фаза 1: JSON Schemas и типы

### 1.1 Создать `skeleton_review_questions.schema.json`

**Файл**: `backend/schemas/skeleton_review_questions.schema.json`

**Требования**:
- Схема из `_DOC/s3/json.md` (строки 7-208)
- Использовать `draft-07` вместо `draft-2020-12` для совместимости
- Поддержка типов UX: `checkbox_group`, `radio_group`, `text_input`, `number_input`, `multi_text`
- Каждый вопрос должен иметь `binding.node_ids`, `ux.type`, `impact` для опций

**Приоритет**: 🔴 Высокий

---

### 1.2 Создать `skeleton_review_answers.schema.json`

**Файл**: `backend/schemas/skeleton_review_answers.schema.json`

**Требования**:
- Схема из `_DOC/s3/json.md` (строки 213-246)
- Поддержка различных типов значений: `string`, `number`, `boolean`, `array`, `object`, `null`
- Формат `date-time` для поля `at`

**Приоритет**: 🔴 Высокий

---

### 1.3 Расширить `contract_skeleton.schema.json`

**Файл**: `backend/schemas/contract_skeleton.schema.json`

**Изменения**:
- Добавить в `SkeletonNode` опциональные поля:
  - `status?: "active" | "omitted"` (по умолчанию `"active"`)
  - `variants?: Variant[]` (структурные варианты узла)
  - `selected_variant_id?: string` (выбранный вариант)

**Новая схема `Variant`**:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["variant_id", "label", "children"],
  "properties": {
    "variant_id": { "type": "string", "minLength": 1 },
    "label": { "type": "string", "minLength": 1 },
    "description": { "type": "string" },
    "children": {
      "type": "array",
      "items": { "$ref": "#/$defs/SkeletonNode" }
    }
  }
}
```

**Приоритет**: 🔴 Высокий

---

### 1.4 Обновить `pre_skeleton_state.schema.json`

**Файл**: `backend/schemas/pre_skeleton_state.schema.json`

**Изменения**:
- Добавить `review` блок:
  ```json
  "review": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "questions": {
        "type": "array",
        "items": { "$ref": "schema://legalagi/skeleton_review_questions/1.0.0#/$defs/Question" }
      },
      "answers": {
        "type": "array",
        "items": { "$ref": "schema://legalagi/skeleton_review_answers/1.0.0#/$defs/Answer" }
      },
      "iteration": { "type": "integer", "minimum": 0, "maximum": 5 },
      "status": {
        "type": "string",
        "enum": ["collecting", "ready_to_apply", "applied", "frozen"]
      },
      "review_id": { "type": "string" }
    }
  }
  ```
- Добавить в `document`:
  - `skeleton_final?: ContractSkeleton` (финальный skeleton после review)
  - `freeze?: { structure?: boolean }` (флаг заморозки структуры)
- Обновить `meta.stage`: добавить `"skeleton_review"` и `"skeleton_final"`

**Приоритет**: 🔴 Высокий

---

### 1.5 Обновить TypeScript типы

**Файл**: `lib/types.ts`

**Добавить**:
- `SkeletonReviewQuestions`, `SkeletonReviewAnswer`, `ReviewQuestion`, `UXSpec`, `Option`, `InputField`, `Binding`, `Constraints`, `ImpactOp`
- `SkeletonNode` расширить: `status?`, `variants?`, `selected_variant_id?`
- `Variant` интерфейс
- `PreSkeletonState` расширить: `review?`, `document.skeleton_final?`, `document.freeze?`
- `StateMeta.stage` расширить: `'skeleton_review' | 'skeleton_final'`
- `LLMStepOutput.step` расширить: `'SKELETON_REVIEW_PLAN' | 'SKELETON_REVIEW_APPLY'`
- `NextAction` расширить: `{ kind: 'show_review_questions' }` (опционально)

**Приоритет**: 🔴 Высокий

---

### 1.6 Зарегистрировать схемы в schema-registry

**Файл**: `backend/schemas/schema-registry.ts`

**Добавить**:
- `skeleton_review_questions.schema.json`
- `skeleton_review_answers.schema.json`

**Приоритет**: 🔴 Высокий

---

## Фаза 2: LLM Prompts

### 2.1 Создать `skeleton-review-plan-step.md`

**Файл**: `backend/prompts/skeleton-review-plan-step.md`

**Содержание**:
- System prompt на русском языке
- Описание задачи: генерация UX-вопросов для настройки структуры skeleton
- Правила:
  - Максимум 7 вопросов за итерацию
  - Вопросы должны быть конкретными и менять структуру/параметры
  - Использовать `tags`, `include_if`, `requires` для поиска структурных развилок
  - Каждый вопрос должен иметь `binding.node_ids` и `impact` для опций
- Примеры формата ответа

**Приоритет**: 🔴 Высокий

---

### 2.2 Создать `skeleton-review-apply-step.md`

**Файл**: `backend/prompts/skeleton-review-apply-step.md`

**Содержание**:
- System prompt на русском языке
- Описание задачи: применение ответов пользователя к skeleton_draft
- Правила:
  - Применять impact операции (set_node_status, select_variant, set_domain_value)
  - Обновлять issues (resolve/add)
  - Не добавлять новые узлы после freeze
  - Формировать skeleton_final при завершении review
- Примеры формата ответа (patch операции)

**Приоритет**: 🔴 Высокий

---

## Фаза 3: Backend логика

### 3.1 Реализовать `runSkeletonReviewPlanStep`

**Файл**: `backend/orchestrator/llm-step-runner.ts`

**Функция**: `runSkeletonReviewPlanStep(state: PreSkeletonState): Promise<LLMStepOutput>`

**Логика**:
- Проверка preconditions: `state.meta.stage === 'skeleton_ready'` и `state.document?.skeleton` существует
- Загрузка промпта `skeleton-review-plan-step.md`
- Передача в LLM: `mission`, `domain`, `skeleton_draft`, `issues`, `review.iteration`
- Валидация ответа по схеме `skeleton_review_questions`
- Возврат `LLMStepOutput` с `step: 'SKELETON_REVIEW_PLAN'` и patch для `review.questions`

**Приоритет**: 🔴 Высокий

---

### 3.2 Реализовать `runSkeletonReviewApplyStep`

**Файл**: `backend/orchestrator/llm-step-runner.ts`

**Функция**: `runSkeletonReviewApplyStep(state: PreSkeletonState, answers: SkeletonReviewAnswer[]): Promise<LLMStepOutput>`

**Логика**:
- Проверка preconditions: `state.review?.status === 'ready_to_apply'` и `answers` не пуст
- Загрузка промпта `skeleton-review-apply-step.md`
- Передача в LLM: `state`, `review.questions`, `answers`
- Валидация ответа по схеме `llm_step_output`
- Возврат `LLMStepOutput` с `step: 'SKELETON_REVIEW_APPLY'` и patch для применения изменений

**Приоритет**: 🔴 Высокий

---

### 3.3 Создать `review-impact-applier.ts`

**Файл**: `backend/orchestrator/review-impact-applier.ts`

**Функции**:
- `applyImpactOperations(state: PreSkeletonState, impactOps: ImpactOp[]): PreSkeletonState`
  - Применяет операции `set_node_status`, `select_variant`, `set_domain_value`, `add_issue`, `resolve_issue`
  - Обновляет skeleton_draft согласно impact
  - Обновляет domain и issues

**Приоритет**: 🟡 Средний

---

### 3.4 Реализовать `processSkeletonReviewPlan`

**Файл**: `backend/orchestrator/session-orchestrator.ts`

**Функция**: `processSkeletonReviewPlan(sessionId: string): Promise<{ state: PreSkeletonState; nextAction: NextAction }>`

**Логика**:
- Проверка preconditions
- Запуск `runSkeletonReviewPlanStep`
- Применение patch к `state.review.questions`
- Обновление `state.review.status = 'collecting'`
- Обновление `state.review.iteration`
- Генерация `review_id` если отсутствует
- Возврат `next_action = { kind: 'show_review_questions' }` или `ask_user`

**Приоритет**: 🔴 Высокий

---

### 3.5 Реализовать `processSkeletonReviewApply`

**Файл**: `backend/orchestrator/session-orchestrator.ts`

**Функция**: `processSkeletonReviewApply(sessionId: string, answers: SkeletonReviewAnswer[]): Promise<{ state: PreSkeletonState; nextAction: NextAction }>`

**Логика**:
- Проверка preconditions
- Сохранение ответов в `state.review.answers`
- Запуск `runSkeletonReviewApplyStep` или применение impact операций напрямую
- Применение изменений к skeleton_draft
- Обновление `state.review.status = 'applied'`
- Проверка лимита итераций (максимум 2):
  - Если достигнут лимит: `state.document.skeleton_final = updated skeleton`, `state.document.freeze.structure = true`, `state.review.status = 'frozen'`, `state.meta.stage = 'skeleton_final'`, `next_action = proceed_to_clause_requirements`
  - Если не достигнут: `state.review.status = 'collecting'`, запуск следующей итерации `processSkeletonReviewPlan`

**Приоритет**: 🔴 Высокий

---

### 3.6 Обновить `policy-guard.ts`

**Файл**: `backend/orchestrator/policy-guard.ts`

**Добавить функцию**: `checkStructureFreeze(state: PreSkeletonState, patch: Patch): { allowed: boolean; reason?: string }`

**Логика**:
- Проверяет, если `state.document.freeze?.structure === true`
- Анализирует patch операции на предмет добавления новых `section/clause` узлов
- Возвращает `{ allowed: false }` если попытка добавить новые узлы после freeze

**Приоритет**: 🟡 Средний

---

## Фаза 4: API Endpoints

### 4.1 Создать `POST /api/session/[sessionId]/review/plan`

**Файл**: `app/api/session/[sessionId]/review/plan/route.ts`

**Логика**:
- Вызывает `processSkeletonReviewPlan(sessionId)`
- Возвращает `{ state, next_action }`

**Приоритет**: 🔴 Высокий

---

### 4.2 Создать `POST /api/session/[sessionId]/review/apply`

**Файл**: `app/api/session/[sessionId]/review/apply/route.ts`

**Request body**: `{ answers: SkeletonReviewAnswer[] }`

**Логика**:
- Валидация `answers` по схеме
- Вызывает `processSkeletonReviewApply(sessionId, answers)`
- Возвращает `{ state, next_action }`

**Приоритет**: 🔴 Высокий

---

## Фаза 5: UI Components

### 5.1 Создать `ReviewQuestionForm.tsx`

**Файл**: `components/ReviewQuestionForm.tsx`

**Компонент**: Универсальная форма для отображения одного вопроса

**Поддержка типов**:
- `checkbox_group` → список чекбоксов
- `radio_group` → радиокнопки
- `text_input` → текстовое поле
- `number_input` → числовое поле
- `multi_text` → несколько полей ввода

**Props**:
- `question: ReviewQuestion`
- `value: unknown` (текущее значение)
- `onChange: (value: unknown) => void`
- `errors?: string[]`

**Приоритет**: 🔴 Высокий

---

### 5.2 Создать `ReviewQuestionsPanel.tsx`

**Файл**: `components/ReviewQuestionsPanel.tsx`

**Компонент**: Панель для отображения всех вопросов review

**Функциональность**:
- Отображает список вопросов из `state.review.questions`
- Сортирует по `priority`
- Показывает `required` вопросы с индикацией
- Отображает `why_this_matters` для каждого вопроса
- Показывает `impact` для опций (опционально, для информации)
- Кнопка "Применить ответы" (отправляет на `/api/session/[sessionId]/review/apply`)

**Props**:
- `questions: ReviewQuestion[]`
- `answers: SkeletonReviewAnswer[]`
- `onSubmit: (answers: SkeletonReviewAnswer[]) => void`
- `isSubmitting?: boolean`

**Приоритет**: 🔴 Высокий

---

### 5.3 Обновить `ResultPane.tsx`

**Файл**: `components/ResultPane.tsx`

**Изменения**:
- Добавить отображение `state.review.questions` если `state.review?.status === 'collecting'`
- Показывать `ReviewQuestionsPanel` вместо обычного skeleton tree
- Показывать индикатор итерации review
- Показывать статус freeze если `state.document.freeze?.structure === true`

**Приоритет**: 🟡 Средний

---

### 5.4 Обновить `app/page.tsx`

**Файл**: `app/page.tsx`

**Изменения**:
- Добавить обработчики для review:
  - `handleStartReview` → вызывает `/api/session/[sessionId]/review/plan`
  - `handleSubmitReviewAnswers` → вызывает `/api/session/[sessionId]/review/apply`
- Обновить логику отображения: показывать review questions если `next_action.kind === 'show_review_questions'`

**Приоритет**: 🟡 Средний

---

## Фаза 6: Интеграция с существующим flow

### 6.1 Обновить `session-orchestrator.ts`

**Файл**: `backend/orchestrator/session-orchestrator.ts`

**Изменения**:
- В `processSkeletonGeneration`: после генерации skeleton устанавливать `state.meta.stage = 'skeleton_review'` и `next_action = { kind: 'show_review_questions' }` (вместо `proceed_to_clause_requirements`)
- В `getSessionState`: обрабатывать `stage === 'skeleton_review'` и возвращать соответствующий `next_action`

**Приоритет**: 🔴 Высокий

---

### 6.2 Обновить `gatekeeper.ts` (опционально)

**Файл**: `backend/orchestrator/gatekeeper.ts`

**Изменения**:
- Добавить проверку готовности к review (если нужно)

**Приоритет**: 🟢 Низкий

---

## Фаза 7: Тестирование и валидация

### 7.1 Unit тесты

**Файлы**: `backend/orchestrator/__tests__/`

- Тесты для `review-impact-applier.ts`
- Тесты для `processSkeletonReviewPlan`
- Тесты для `processSkeletonReviewApply`
- Тесты для `checkStructureFreeze`

**Приоритет**: 🟡 Средний

---

### 7.2 Интеграционные тесты

**Файлы**: `app/api/session/[sessionId]/review/__tests__/`

- Тесты для API endpoints
- Тесты для полного flow: plan → apply → freeze

**Приоритет**: 🟡 Средний

---

## Приоритеты реализации

### 🔴 Критический путь (MVP)

1. Фаза 1: JSON Schemas и типы (1.1-1.6)
2. Фаза 2: LLM Prompts (2.1-2.2)
3. Фаза 3: Backend логика (3.1, 3.2, 3.4, 3.5)
4. Фаза 4: API Endpoints (4.1, 4.2)
5. Фаза 5: UI Components (5.1, 5.2)
6. Фаза 6: Интеграция (6.1)

### 🟡 Важно, но не блокирует

- Фаза 3: `review-impact-applier.ts` (3.3)
- Фаза 3: `policy-guard.ts` (3.6)
- Фаза 5: Обновление UI (5.3, 5.4)
- Фаза 7: Тестирование

### 🟢 Опционально

- Фаза 6: Обновление `gatekeeper.ts` (6.2)

---

## Определение готовности (Definition of Done)

✅ **Готово**, если:

1. Система генерирует 3-7 UX-вопросов для любого skeleton_draft
2. Вопросы отображаются в UI корректно (checkbox/radio/input)
3. Ответы пользователя приводят к изменению skeleton_draft:
   - Узлы включаются/выключаются (status)
   - Выбираются варианты (selected_variant_id)
   - При необходимости пополняется domain (через input)
4. После 1-2 итераций skeleton фиксируется как skeleton_final (freeze=true)
5. После freeze дальнейшие шаги не могут добавлять новые секции/пункты
6. Все схемы валидируются корректно
7. API endpoints работают без ошибок
8. UI компоненты отображают все типы вопросов

---

## Заметки и рекомендации

1. **Абстрактность**: Не добавлять логику "какие секции бывают у договора" в код. Весь смысл в tags, include_if, requires и LLM-планировании.

2. **Стабильность node_id**: Узлы не удаляются физически, используется `status: omitted`. Это гарантирует стабильность и не ломает freeze.

3. **Impact операции**: UI не применяет impact сам — он лишь отправляет выбранные значения. Применение делает backend/оркестратор.

4. **Итерации**: Максимум 2 итерации review (или 1, если хочешь жёстче). После этого — freeze.

5. **Совместимость схем**: Использовать `draft-07` для всех схем для совместимости с текущим Ajv.

---

## Следующие шаги

После реализации SKELETON_REVIEW можно переходить к следующему этапу:
- **Шаг 4**: Clause Requirements Generation (генерация требований для пунктов)
- **Шаг 5**: Clause Text Generation (генерация текста пунктов)
