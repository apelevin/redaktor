# Архитектура Pipeline: от начала до конца

Документ описывает текущую реализацию pipeline генерации юридических документов, включая все этапы обработки от инициализации до финальной сборки документа.

---

## Общая схема

Pipeline состоит из последовательных этапов, которые могут ветвиться в зависимости от наличия готовых инструкций и клауз в базе знаний (RAG). Основной поток данных проходит через следующие компоненты:

1. **Frontend (React/Next.js)** — интерфейс пользователя
2. **API Routes (Next.js)** — эндпоинты для каждого этапа pipeline
3. **State Management (Zustand)** — централизованное хранилище состояния документа
4. **RAG (Pinecone)** — поиск готовых инструкций и клауз
5. **LLM (OpenAI)** — генерация через языковые модели
6. **Document Assembler** — финальная сборка документа

---

## 1. Инициализация документа

### Точка входа
Пользователь нажимает кнопку "Новый документ" в компоненте `ChatPanel` (`app/components/ChatPanel.tsx`).

### Действия
- Сброс состояния через `useDocumentStore.reset()`
- Запрос типа документа у пользователя (prompt)
- Сохранение `document_type` в store через `setDocumentType()`
- Переход к этапу проверки инструкций

### Состояние
```typescript
{
  document_type: string,
  jurisdiction?: string,
  style?: string,
  qa_context: [],
  skeleton: [],
  clauses: [],
  contract_variables: {},
  clauses_summary: [],
  cost_records: []
}
```

---

## 2. Поиск инструкции (Instruction Retrieval)

### API Endpoint
`POST /api/pipeline/instruction`

### Реализация
`app/api/pipeline/instruction/route.ts` → `lib/pinecone/instructions.ts`

### Процесс
1. Формируется запрос к Pinecone индексу `instructions`
2. Поиск по фильтрам:
   - `document_type` (обязательно)
   - `jurisdiction` (опционально)
3. Если найдена инструкция:
   - Извлекается `skeleton` (структура документа)
   - Извлекаются `questions` (готовые вопросы)
   - Извлекаются `related_norms` (связанные нормы)
   - Возвращается `instruction_found: true`
4. Если не найдена:
   - Возвращается `instruction_found: false`

### Ветвление
- **Если инструкция найдена и содержит skeleton:**
  - Сохраняется skeleton в store через `setSkeleton()`
  - Переход к этапу генерации клауз (пропуск сбора контекста)
- **Если инструкция не найдена:**
  - Переход к этапу сбора контекста

---

## 3. Сбор контекста (Context Collection)

### API Endpoint
`POST /api/pipeline/context`

### Реализация
`app/api/pipeline/context/route.ts` → `lib/openai/question-generator.ts`

### Процесс (итеративный цикл)

#### 3.1. Генерация следующего вопроса
- Функция: `generateNextQuestion()`
- Промпт: `prompts/question-generation.md`
- Модель: определяется через `getModelConfig('question_generation')`
- Ограничение: максимум 7 вопросов (`MAX_QUESTIONS = 7`)

**Входные данные:**
- `document_type`
- `jurisdiction` (опционально)
- `style` (опционально)
- `qa_context` (массив предыдущих вопросов/ответов)

**Выходные данные:**
- `question: string | null` — следующий вопрос или null, если вопросов больше нет
- `usage: TokenUsage` — данные об использовании токенов
- `model: string` — использованная модель

#### 3.2. Проверка завершения сбора контекста
- Функция: `checkContextCompletion()`
- Промпт: `prompts/context-completion.md`
- Модель: определяется через `getModelConfig('context_completion')`
- Формат ответа: JSON (`response_format: { type: 'json_object' }`)

**Выходные данные:**
- `is_complete: boolean` — достаточно ли собрано информации
- `reason: string` — причина завершения или продолжения
- `usage: TokenUsage`
- `model: string`

#### 3.3. Цикл взаимодействия
1. Frontend вызывает `/api/pipeline/context` с `action: 'generate_question'`
2. Если получен вопрос:
   - Отображается пользователю
   - Ожидается ответ
3. После ответа:
   - Ответ добавляется в `qa_context` через `addQAContext()`
   - Вызывается `/api/pipeline/context` с `action: 'check_completion'`
4. Если `is_complete === true`:
   - Переход к генерации skeleton
5. Если `is_complete === false`:
   - Возврат к шагу 1 (генерация следующего вопроса)

### Учет стоимости
На каждом шаге сохраняются записи о стоимости через `addCostRecord()`:
- Шаг: `'question_generation'` или `'context_completion'`
- Модель, usage, расчет стоимости через `calculateCost()`

---

## 4. Генерация структуры (Skeleton Generation)

### API Endpoint
`POST /api/pipeline/skeleton`

### Реализация
`app/api/pipeline/skeleton/route.ts` → `lib/openai/skeleton-generator.ts`

### Процесс
1. Формируется промпт из `prompts/skeleton-generation.md`
2. В промпт подставляются:
   - `document_type`
   - `qa_context` (форматированный как текст)
   - `jurisdiction` (если указан)
   - `style` (если указан)
3. Вызов OpenAI API:
   - Модель: `getModelConfig('skeleton_generation')`
   - Формат ответа: JSON (`response_format: { type: 'json_object' }`)
4. Парсинг ответа:
   - Ожидается структура `{ skeleton: Section[] }`
   - Валидация формата
5. Сохранение результата:
   - `setSkeleton(skeleton)` в store
   - Переход к генерации клауз

### Формат skeleton
```typescript
interface Section {
  id: string;
  title: string;
  level: number;
  subsections?: Section[];
}
```

### Учет стоимости
- Шаг: `'skeleton_generation'`
- Сохранение через `addCostRecord()`

---

## 5. Генерация клауз (Clause Generation)

### API Endpoint
`POST /api/pipeline/clause`

### Реализация
`app/api/pipeline/clause/route.ts` → `lib/pinecone/clauses.ts` и `lib/openai/clause-generator.ts`

### Процесс (для каждого раздела skeleton)

#### 5.1. Поиск в RAG (первичная попытка)
- Функция: `searchClause()` в `lib/pinecone/clauses.ts`
- Индекс: `clauses` в Pinecone
- Фильтры:
  - `document_type`
  - `section` (ID текущего раздела)
  - `jurisdiction` (если указан)
- Порог релевантности: `minScore: 0.7`

**Если клауза найдена:**
- Возвращается `clause_found: true`
- Клауза извлекается из метаданных
- Источник помечается как `source: 'rag'`
- Метаданные включают `sourceType` (template/law/case) и `sourceReference`
- **Стоимость не учитывается** (RAG поиск бесплатный)

**Если клауза не найдена:**
- Переход к генерации через LLM

#### 5.2. Генерация через LLM
- Функция: `generateClause()` в `lib/openai/clause-generator.ts`
- Промпт: `prompts/clause-generation.md`
- Модель: `getModelConfig('clause_generation')`
- Формат ответа: JSON

**Входные данные:**
- `document_type`
- `current_section` (ID раздела)
- `qa_context`
- `jurisdiction`, `style`
- `related_norms` (если были найдены ранее)
- `clauses_summary` (краткие описания уже созданных клауз)
- `contract_variables` (глобальные переменные договора)

**Выходные данные:**
- `clause: Clause` — сгенерированный текст
- `assumptions: string[]` — допущения, сделанные моделью
- `related_norms: string[]` — связанные нормы
- `usage: TokenUsage`
- `model: string`

**Источник помечается как `source: 'llm'`**

#### 5.3. Обработка результата
1. Клауза сохраняется через `addClause()`
2. Создается краткое summary через `addClauseSummary()`
3. Если в клаузе обнаружены переменные договора:
   - Обновляется `contract_variables` через `setContractVariable()`
4. Учет стоимости (только для LLM):
   - Шаг: `'clause_generation'`
   - Сохранение через `addCostRecord()`

#### 5.4. Рекурсивная обработка skeleton
- Функция `generateClausesForSkeleton()` в `ChatPanel.tsx`
- Обход всех разделов skeleton (включая подразделы)
- Последовательная обработка каждого раздела
- После обработки всех разделов: переход к завершению

---

## 6. Сборка документа (Document Assembly)

### API Endpoint
`POST /api/pipeline/assemble`

### Реализация
`app/api/pipeline/assemble/route.ts` → `lib/utils/document-assembler.ts`

### Процесс
1. Функция `assembleDocument()`:
   - Рекурсивный обход `skeleton`
   - Для каждого раздела поиск соответствующей клаузы по `sectionId`
   - Формирование структурированного документа с заголовками и содержимым
2. Функция `formatDocumentForDisplay()`:
   - Добавление меток источника (`[RAG]` или `[LLM]`)
   - Добавление метаданных (sourceType, если есть)
   - Форматирование для отображения

### Формат результата
```typescript
interface AssembledDocument {
  sections: Array<{
    section: Section;
    clause?: Clause;
    content: string;
  }>;
  fullText: string;
}
```

---

## 7. Управление состоянием

### Store (Zustand)
Файл: `lib/pipeline/state.ts`

### Основные сущности
- `DocumentState` — состояние документа
- `CostRecord` — запись о стоимости операции
- `useDocumentStore` — хук для доступа к store

### Ключевые действия
- `setDocumentType()` — установка типа документа
- `addQAContext()` — добавление вопроса/ответа
- `setSkeleton()` — установка структуры
- `addClause()` — добавление клаузы
- `updateClause()` — обновление клаузы
- `setContractVariable()` — установка переменной договора
- `addClauseSummary()` — добавление summary клаузы
- `addCostRecord()` — запись о стоимости
- `getTotalCost()` — расчет общей стоимости
- `reset()` — сброс состояния

---

## 8. Учет стоимости

### Компоненты
- `lib/utils/cost-calculator.ts` — расчет стоимости на основе модели и usage
- `cost_records` в store — массив записей о всех операциях

### Учитываемые операции
- `question_generation` — генерация вопроса
- `context_completion` — проверка завершения контекста
- `skeleton_generation` — генерация структуры
- `clause_generation` — генерация клаузы (только для LLM, не для RAG)

### Отображение
- Общая стоимость отображается в `ChatPanel` в реальном времени
- Форматирование через `formatCost()`

---

## 9. Поток данных между компонентами

### Frontend → API
```
ChatPanel.tsx
  ↓ (fetch)
/api/pipeline/instruction
/api/pipeline/context
/api/pipeline/skeleton
/api/pipeline/clause
/api/pipeline/assemble
```

### API → Services
```
API Routes
  ↓
lib/pinecone/instructions.ts
lib/pinecone/clauses.ts
lib/openai/question-generator.ts
lib/openai/skeleton-generator.ts
lib/openai/clause-generator.ts
lib/utils/document-assembler.ts
```

### Services → External
```
Services
  ↓
Pinecone (RAG)
OpenAI API (LLM)
```

### State Management
```
useDocumentStore (Zustand)
  ↓
Все компоненты имеют доступ к единому состоянию
```

---

## 10. Обработка ошибок

### Уровни обработки
1. **API Routes:**
   - Try-catch блоки
   - Возврат `{ error: string }` с HTTP статусом
2. **Frontend:**
   - Обработка ошибок в async функциях
   - Отображение сообщений об ошибках в чате
   - Продолжение работы при возможности (fallback)

### Типичные ошибки
- Отсутствие обязательных параметров → 400
- Ошибки OpenAI API → 500 с деталями
- Ошибки Pinecone → 500, fallback к LLM
- Ошибки парсинга JSON → обработка с fallback

---

## 11. Особенности реализации

### RAG vs LLM
- **RAG (Pinecone):** используется для поиска готовых инструкций и клауз
- **LLM (OpenAI):** используется для генерации, когда RAG не дает результата
- Приоритет: сначала RAG, затем LLM

### Контекстная память
- `qa_context` — накапливается в процессе сбора контекста
- `clauses_summary` — накапливается при генерации клауз
- `contract_variables` — обновляется при обнаружении переменных
- Все эти данные передаются в каждый следующий запрос к LLM

### Рекурсивная обработка
- Skeleton может содержать вложенные подразделы
- Обработка происходит рекурсивно через `processSection()`
- Каждый подраздел обрабатывается последовательно

### Асинхронность
- Все операции асинхронные
- Frontend показывает индикаторы загрузки
- Последовательная обработка разделов skeleton (не параллельная)

---

## 12. Завершение pipeline

### Финальные действия
1. Все разделы skeleton обработаны
2. Все клаузы сгенерированы или найдены
3. Документ готов к отображению
4. Стадия меняется на `'complete'`
5. Пользователь может:
   - Редактировать документ в `DocumentEditor`
   - Просматривать общую стоимость
   - Экспортировать документ

### Состояние после завершения
```typescript
{
  document_type: string,
  qa_context: QAContext[],
  skeleton: Section[],
  clauses: Clause[],
  contract_variables: Record<string, any>,
  clauses_summary: string[],
  cost_records: CostRecord[],
  // ... готов к сборке и отображению
}
```

---

## Заключение

Pipeline представляет собой последовательную цепочку этапов с возможностью ветвления на основе наличия готовых данных в RAG. Основной принцип: сначала поиск в базе знаний, затем генерация через LLM. Все операции учитываются для расчета стоимости, состояние централизовано в Zustand store, ошибки обрабатываются с fallback механизмами.


