# План реализации: Skeleton Generation (Шаг 2)

## Обзор

Реализация этапа генерации Skeleton договора после успешного завершения pre-skeleton этапа. Skeleton — это структура договора без финальных формулировок: только иерархия узлов, теги, purpose, условия включения.

## Цель

Добавить в пайплайн шаг **SKELETON_GENERATE**, который:
1. Запускается только если `state.meta.stage = pre_skeleton` и `state.gate.ready_for_skeleton = true`
2. Вызывает LLM и получает `llm_step_output` с patch для `state.document.skeleton`
3. Валидирует и применяет skeleton
4. Выполняет линтинг skeleton
5. Переводит stage в `skeleton_ready`

---

## Архитектурные принципы

1. **RU-only**: язык `ru`, юрисдикция `RU` — константа
2. **Код не знает доменных полей**: `state.domain` — свободный JSON
3. **Схемы как данные**: JSON Schema хранится отдельно и используется для валидации
4. **LLM возвращает patch**: не весь state, а только изменения
5. **Никаких юридических текстов**: только структура, purpose, requires, tags, include_if

---

## Структура Skeleton

Skeleton — это дерево узлов `Node`:

```typescript
interface Node {
  node_id: string;           // Стабильный уникальный ID
  kind: 'document' | 'section' | 'clause' | 'appendix';
  title: string;             // Название на русском
  tags: string[];            // Семантические теги
  purpose?: string;          // 1-2 предложения, зачем узел
  include_if?: string[];     // Условия включения (пути в state.domain)
  requires?: string[];       // Пути в state.domain, нужные для генерации текста
  notes_for_generator?: string; // Опциональные заметки
  children: Node[];          // Вложенные узлы
}
```

---

## Фаза 1: JSON Schema для Skeleton

### 1.1. Создать схему contract_skeleton.schema.json

**Файл**: `backend/schemas/contract_skeleton.schema.json`

**Требования**:
- Валидирует корневой узел `Node`
- Рекурсивно валидирует `children`
- Обязательные поля: `node_id`, `kind`, `title`, `tags`, `children`
- Опциональные: `purpose`, `include_if`, `requires`, `notes_for_generator`
- `kind` enum: `document`, `section`, `clause`, `appendix`
- `tags` — массив строк
- `include_if` и `requires` — массивы строк (JSON Pointer paths)

### 1.2. Обновить schema-registry.ts

- Добавить `contract_skeleton.schema.json` в `SCHEMA_REGISTRY`
- Добавить функцию `validateSkeleton(skeleton: unknown): ValidationResult`

---

## Фаза 2: Расширение State для Skeleton

### 2.1. Обновить pre_skeleton_state.schema.json

**Добавить в схему**:
```json
{
  "document": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "skeleton": {
        "$ref": "#/$defs/ContractSkeleton"
      },
      "skeleton_meta": {
        "type": "object",
        "properties": {
          "schema_version": { "type": "string" },
          "generated_at": { "type": "string", "format": "date-time" },
          "generated_by_step": { "type": "string" },
          "node_count": { "type": "integer" }
        }
      }
    }
  }
}
```

**Важно**: `document` — опциональное поле, создаётся через patch

### 2.2. Обновить lib/types.ts

**Добавить типы**:
```typescript
export interface ContractSkeleton {
  root: SkeletonNode;
}

export interface SkeletonNode {
  node_id: string;
  kind: 'document' | 'section' | 'clause' | 'appendix';
  title: string;
  tags: string[];
  purpose?: string;
  include_if?: string[];
  requires?: string[];
  notes_for_generator?: string;
  children: SkeletonNode[];
}

export interface SkeletonMeta {
  schema_version: string;
  generated_at: string;
  generated_by_step: string;
  node_count: number;
}

// Обновить PreSkeletonState
export interface PreSkeletonState {
  // ... существующие поля
  document?: {
    skeleton?: ContractSkeleton;
    skeleton_meta?: SkeletonMeta;
  };
}
```

### 2.3. Обновить llm_step_output.schema.json

**Добавить в enum шагов**:
```json
{
  "step": {
    "enum": ["INTERPRET", "GATE_CHECK", "SKELETON_GENERATE"]
  }
}
```

**Добавить в next_action.kind**:
```json
{
  "kind": {
    "enum": ["ask_user", "proceed_to_gate", "proceed_to_skeleton", "proceed_to_clause_requirements", "halt_error"]
  }
}
```

---

## Фаза 3: Реализация SKELETON_GENERATE шага

### 3.1. Создать промпт для SKELETON_GENERATE

**Файл**: `backend/prompts/skeleton-generate-step.md`

**Структура промпта**:
- Системные правила (из promt.md)
- Текущий state (domain, issues)
- JSON Schema для skeleton
- Инструкции по формированию patch
- Примеры структуры skeleton

**Переменные**:
- `{{state_json}}` — полный state
- `{{skeleton_schema_json}}` — схема contract_skeleton
- `{{domain_json}}` — только domain из state

### 3.2. Реализовать runSkeletonGenerateStep

**Файл**: `backend/orchestrator/llm-step-runner.ts`

**Функция**: `runSkeletonGenerateStep(state: PreSkeletonState): Promise<LLMStepOutput>`

**Логика**:
1. Проверка preconditions (stage, gate)
2. Загрузка промпта
3. Вызов LLM с `chatJSON`
4. Валидация ответа по `llm_step_output.schema.json`
5. Проверка `step === 'SKELETON_GENERATE'`
6. Возврат `llmOutput`

### 3.3. Обновить session-orchestrator.ts

**Добавить функцию**: `processSkeletonGeneration(sessionId: string): Promise<{ state: PreSkeletonState; nextAction: NextAction }>`

**Логика**:
1. Проверка preconditions
2. Вызов `runSkeletonGenerateStep`
3. Применение patch через `applyLLMOutput`
4. Валидация `state.document.skeleton` по `contract_skeleton.schema.json`
5. Запуск линтера skeleton
6. Обновление `state.meta.stage` и `state.meta.status`
7. Сохранение в storage
8. Возврат результата

---

## Фаза 4: Skeleton Linter

### 4.1. Создать skeleton-linter.ts

**Файл**: `backend/orchestrator/skeleton-linter.ts`

**Функция**: `lintSkeleton(skeleton: ContractSkeleton): { valid: boolean; issues: Issue[] }`

**Проверки**:
1. ✅ Все узлы имеют `tags` и `purpose`
2. ✅ `node_id` уникальны по всему дереву
3. ✅ Нет пустых `title`
4. ✅ Нет узлов `clause` без `tags`
5. ⚠️ `requires[]` пути не пустые строки (soft-check)

**Возврат**:
- `valid: true` — если все проверки пройдены
- `issues: Issue[]` — массив проблем с severity=high/med

### 4.2. Интеграция линтера

**В `processSkeletonGeneration`**:
- После валидации схемы запустить `lintSkeleton`
- Если есть issues:
  - Добавить в `state.issues`
  - Установить `state.meta.status = 'blocked'`
  - `next_action.kind = 'ask_user'` или `'halt_error'`
- Если всё ок:
  - `state.meta.stage = 'skeleton_ready'`
  - `state.meta.status = 'ready'`

---

## Фаза 5: API Endpoints

### 5.1. Добавить POST /api/session/[sessionId]/skeleton

**Файл**: `app/api/session/[sessionId]/skeleton/route.ts`

**Логика**:
1. Проверка существования сессии
2. Проверка preconditions (stage, gate)
3. Вызов `processSkeletonGeneration`
4. Возврат обновлённого state и next_action

**Ошибки**:
- 404: Session not found
- 400: Preconditions not met (stage != pre_skeleton или gate.ready_for_skeleton != true)
- 500: Ошибка генерации

---

## Фаза 6: UI Интеграция

### 6.1. Обновить ResultPane

**Файл**: `components/ResultPane.tsx`

**Добавить**:
- Отображение `state.document.skeleton` как дерево
- Компонент `SkeletonTree` для визуализации иерархии
- Показ статуса skeleton (готов/заблокирован)

### 6.2. Создать SkeletonTree компонент

**Файл**: `components/SkeletonTree.tsx`

**Функциональность**:
- Рекурсивное отображение дерева узлов
- Раскрытие/сворачивание узлов
- Отображение `kind`, `title`, `tags`, `purpose`
- Подсветка узлов с `include_if` или `requires`

### 6.3. Добавить кнопку "Generate Skeleton"

**Файл**: `components/ResultPane.tsx` или `components/ChatPane.tsx`

**Условия показа**:
- `state.meta.stage === 'pre_skeleton'`
- `state.gate?.ready_for_skeleton === true`
- `!state.document?.skeleton` (ещё не сгенерирован)

**Действие**:
- Вызов `POST /api/session/[sessionId]/skeleton`
- Обновление UI после успешной генерации

### 6.4. Обновить StateMeta компонент

**Добавить отображение**:
- Статус skeleton (если есть)
- Количество узлов в skeleton
- Дата генерации skeleton

---

## Фаза 7: Обновление типов и схем

### 7.1. Обновить все места, где используется stage

**Файлы**:
- `lib/types.ts` — добавить `'skeleton_ready'` в enum stage
- `backend/schemas/pre_skeleton_state.schema.json` — обновить enum stage
- `backend/orchestrator/session-orchestrator.ts` — обработка нового stage

### 7.2. Обновить getSessionState

**Логика определения next_action**:
- Если `stage === 'skeleton_ready'` → `next_action.kind = 'proceed_to_clause_requirements'`
- Если skeleton заблокирован issues → `next_action.kind = 'ask_user'`

---

## Фаза 8: Тестирование и валидация

### 8.1. Тестовые сценарии

1. **Успешная генерация**:
   - Gate ready → Generate Skeleton → Skeleton валиден → Stage = skeleton_ready

2. **Неполные данные**:
   - Gate ready → Generate Skeleton → LLM создаёт issues → Status = blocked

3. **Ошибка линтера**:
   - Skeleton сгенерирован → Линтер находит проблемы → Issues добавлены → Status = blocked

4. **Повторная генерация**:
   - Skeleton уже есть → Можно перегенерировать (заменить существующий)

### 8.2. Валидация на примере "трудовой договор"

**Ожидаемый результат**:
- Skeleton содержит разделы: Предмет, Обязанности, Оплата, Срок действия и т.д.
- Каждый раздел имеет `tags`, `purpose`, `node_id`
- Нет юридических формулировок в skeleton
- `node_id` уникальны и стабильны

---

## Порядок реализации

### Приоритет 1 (Базовые компоненты)
1. ✅ JSON Schema для skeleton
2. ✅ Обновление типов (ContractSkeleton, SkeletonNode)
3. ✅ Обновление pre_skeleton_state.schema.json
4. ✅ Обновление llm_step_output.schema.json

### Приоритет 2 (Core логика)
5. ✅ Промпт для SKELETON_GENERATE
6. ✅ runSkeletonGenerateStep
7. ✅ processSkeletonGeneration
8. ✅ Skeleton Linter

### Приоритет 3 (API и UI)
9. ✅ API endpoint POST /api/session/[sessionId]/skeleton
10. ✅ SkeletonTree компонент
11. ✅ Кнопка "Generate Skeleton"
12. ✅ Обновление ResultPane

### Приоритет 4 (Полировка)
13. ✅ Обработка ошибок и edge cases
14. ✅ Логирование и отладка
15. ✅ Тестирование на реальных примерах

---

## Детали реализации

### Skeleton Linter: Детальные проверки

```typescript
function lintSkeleton(skeleton: ContractSkeleton): LintResult {
  const issues: Issue[] = [];
  const nodeIds = new Set<string>();
  
  function traverse(node: SkeletonNode, path: string[]): void {
    // Проверка уникальности node_id
    if (nodeIds.has(node.node_id)) {
      issues.push({
        id: `duplicate_node_id_${node.node_id}`,
        severity: 'high',
        title: `Дублирующийся node_id: ${node.node_id}`,
        why_it_matters: 'node_id должны быть уникальными',
        resolution_hint: 'Исправьте node_id для узла',
        status: 'open',
      });
    }
    nodeIds.add(node.node_id);
    
    // Проверка обязательных полей
    if (!node.tags || node.tags.length === 0) {
      issues.push({
        id: `missing_tags_${node.node_id}`,
        severity: 'high',
        title: `Узел ${node.node_id} не имеет tags`,
        why_it_matters: 'tags необходимы для семантической классификации',
        resolution_hint: 'Добавьте tags для узла',
        status: 'open',
      });
    }
    
    if (!node.purpose || node.purpose.trim().length === 0) {
      issues.push({
        id: `missing_purpose_${node.node_id}`,
        severity: 'med',
        title: `Узел ${node.node_id} не имеет purpose`,
        why_it_matters: 'purpose объясняет назначение узла',
        resolution_hint: 'Добавьте purpose для узла',
        status: 'open',
      });
    }
    
    if (!node.title || node.title.trim().length === 0) {
      issues.push({
        id: `empty_title_${node.node_id}`,
        severity: 'high',
        title: `Узел ${node.node_id} имеет пустой title`,
        why_it_matters: 'title обязателен для отображения',
        resolution_hint: 'Добавьте title для узла',
        status: 'open',
      });
    }
    
    // Проверка clause без tags
    if (node.kind === 'clause' && (!node.tags || node.tags.length === 0)) {
      issues.push({
        id: `clause_without_tags_${node.node_id}`,
        severity: 'high',
        title: `Clause ${node.node_id} не имеет tags`,
        why_it_matters: 'Clause без tags не может быть правильно обработан',
        resolution_hint: 'Добавьте tags для clause',
        status: 'open',
      });
    }
    
    // Soft-check: requires не должны быть пустыми строками
    if (node.requires) {
      const emptyRequires = node.requires.filter(r => !r || r.trim().length === 0);
      if (emptyRequires.length > 0) {
        issues.push({
          id: `empty_requires_${node.node_id}`,
          severity: 'low',
          title: `Узел ${node.node_id} имеет пустые requires`,
          why_it_matters: 'Пустые requires указывают на ошибку',
          resolution_hint: 'Удалите пустые requires или заполните их',
          status: 'open',
        });
      }
    }
    
    // Рекурсивно проверяем children
    node.children.forEach((child, index) => {
      traverse(child, [...path, `children[${index}]`]);
    });
  }
  
  traverse(skeleton.root, ['root']);
  
  return {
    valid: issues.length === 0,
    issues,
  };
}
```

### Пример patch для skeleton

```json
{
  "format": "merge_patch",
  "ops": {
    "document": {
      "skeleton": {
        "root": {
          "node_id": "doc_root",
          "kind": "document",
          "title": "Договор",
          "tags": ["contract", "root"],
          "purpose": "Корневой узел договора",
          "children": [
            {
              "node_id": "section_1",
              "kind": "section",
              "title": "Предмет договора",
              "tags": ["subject", "main"],
              "purpose": "Определяет предмет договора",
              "requires": ["/domain/subject"],
              "children": []
            }
          ]
        }
      },
      "skeleton_meta": {
        "schema_version": "1.0.0",
        "generated_at": "2025-01-XX...",
        "generated_by_step": "SKELETON_GENERATE",
        "node_count": 2
      }
    }
  }
}
```

---

## Зависимости от существующего кода

### Используемые модули
- ✅ `backend/orchestrator/llm-step-runner.ts` — добавить `runSkeletonGenerateStep`
- ✅ `backend/orchestrator/patch-applier.ts` — уже поддерживает merge_patch
- ✅ `backend/orchestrator/session-orchestrator.ts` — добавить `processSkeletonGeneration`
- ✅ `backend/schemas/schema-registry.ts` — добавить skeleton schema
- ✅ `backend/prompts/prompt-loader.ts` — загрузка промпта
- ✅ `backend/llm/openrouter.ts` — вызов LLM

### Новые модули
- 🆕 `backend/orchestrator/skeleton-linter.ts` — линтинг skeleton
- 🆕 `backend/prompts/skeleton-generate-step.md` — промпт для генерации
- 🆕 `components/SkeletonTree.tsx` — визуализация skeleton

---

## Критерии готовности (Definition of Done)

- [ ] На примере "трудовой договор" система создаёт skeleton-дерево с секциями и пунктами
- [ ] Skeleton валиден по `contract_skeleton.schema.json`
- [ ] В skeleton нет юридического текста, только структура
- [ ] `node_id` уникальны и стабильны
- [ ] Если `state.domain` неполный, шаг не "выдумывает", а создаёт issues и/или задаёт уточнение
- [ ] Линтер находит проблемы и создаёт issues
- [ ] UI отображает skeleton как дерево
- [ ] Кнопка "Generate Skeleton" появляется при `gate.ready_for_skeleton = true`
- [ ] После успешной генерации `stage = skeleton_ready`
- [ ] API endpoint работает корректно

---

## Примечания

1. **Версионирование схем**: При изменении `contract_skeleton.schema.json` нужно обновить версию в `skeleton_meta.schema_version`

2. **Перегенерация**: Пользователь может захотеть перегенерировать skeleton. Нужно предусмотреть возможность замены существующего skeleton.

3. **Производительность**: Генерация skeleton может занять время (LLM запрос). Нужно показывать loading состояние в UI.

4. **Ошибки LLM**: Если LLM вернёт невалидный JSON или неправильную структуру, нужно обработать ошибку и создать issue.

5. **Интеграция с будущими шагами**: После skeleton будет этап генерации clause requirements. Нужно предусмотреть плавный переход.
