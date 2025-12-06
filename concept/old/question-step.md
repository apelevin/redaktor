
## INSTRUCTION: Оптимизация шага уточняющих вопросов (до генерации skeleton)

### Цель

Сделать первый шаг пайплайна (сбор контекста через вопросы) более умным:

* **2–4 содержательных вопроса вместо 5–7**,
* без повторов,
* каждый вопрос покрывает сразу несколько “дыр” в информации,
* завершение как только собран **минимально достаточный** контекст для запуска генерации skeleton-а.

Этот шаг работает **до** генерации skeleton-а. Основные входы:
`document_type`, `jurisdiction` (РФ), `style`, `qa_context`.

---

## 1. Ввести профиль обязательных полей по типу документа

Сделать карту “что вообще нужно узнать” до генерации skeleton-а:

```ts
// Пример: можно хранить в отдельном файле lib/pipeline/context-profile.ts
type ContextFieldId =
  | 'parties'
  | 'subject'
  | 'term'
  | 'price'
  | 'delivery_terms'
  | 'responsibility'
  | 'termination'
  | 'special_type_field'; // любые специфичные штуки

interface ContextField {
  id: ContextFieldId;
  label: string;             // человекочитаемое имя, для промпта
  critical: boolean;         // критично ли для старта skeleton
}

type DocumentTypeProfile = {
  document_type: string;
  fields: ContextField[];
};

const CONTEXT_PROFILES: DocumentTypeProfile[] = [
  {
    document_type: 'договор поставки',
    fields: [
      { id: 'parties', label: 'Стороны договора', critical: true },
      { id: 'subject', label: 'Предмет и тип товара', critical: true },
      { id: 'delivery_terms', label: 'Базовые условия поставки и график', critical: true },
      { id: 'price', label: 'Подход к цене и расчетам (фикс/диапазон/формула)', critical: true },
      { id: 'term', label: 'Срок действия договора (примерно)', critical: false },
      { id: 'responsibility', label: 'Особые пожелания по ответственности/штрафам', critical: false },
    ],
  },
  // Другие типы документов…
];
```

Задача: **для каждого `document_type` иметь список полей**, какие нужны на этапе вопросов.

---

## 2. Функция вычисления «чего ещё не хватает»

Сделать утилиту, которая по `document_type` и `qa_context` выдаёт список недостающих полей:

```ts
interface QA {
  question: string;
  answer: string;
}

interface MissingFieldInfo {
  id: ContextFieldId;
  label: string;
  critical: boolean;
}

function computeMissingFields(
  document_type: string,
  qa_context: QA[]
): MissingFieldInfo[] {
  const profile = CONTEXT_PROFILES.find(
    p => p.document_type === document_type
  );
  if (!profile) return [];

  const allText = qa_context
    .map(qa => `${qa.question}\n${qa.answer}`)
    .join('\n')
    .toLowerCase();

  // Очень простая эвристика: по ключевым словам.
  // Позже можно заменить на LLM, но на старте достаточно.
  const isFieldCovered = (field: ContextField) => {
    // здесь можно сделать маппинг id → набор ключевых слов
    // или вынести в конфиг
    // для MVP достаточно грубой эвристики
    return allText.includes(field.label.toLowerCase());
  };

  return profile.fields.filter(field => !isFieldCovered(field));
}
```

Эта функция должна вызываться:

* перед генерацией нового вопроса (`generateNextQuestion`),
* при проверке завершённости (`checkContextCompletion`).

---

## 3. Новая логика генерации следующего вопроса

В `generateNextQuestion` добавить:

1. Получить `missing_fields = computeMissingFields(document_type, qa_context)`.

2. Выделить:

   * `critical_missing = missing_fields.filter(f => f.critical)`
   * `non_critical_missing = missing_fields.filter(f => !f.critical)`

3. Правила:

* **Если `critical_missing.length === 0` → вопросов больше не задаём, возвращаем `question: null`.**
* **Если `qa_context.length >= HARD_LIMIT` (например, 4–5) → тоже `question: null`.**

4. Если всё ещё есть критичные поля — сгенерировать **один вопрос-агрегатор**, который:

* покрывает **2–4 поля одновременно**,
* не повторяет уже спрошенные темы.

### Как это подать в промпт

Перед вызовом LLM формировать дополнительные переменные для промпта:

```ts
const missingFields = computeMissingFields(params.document_type, params.qa_context);

const criticalLabels = missingFields
  .filter(f => f.critical)
  .map(f => f.label);

const nonCriticalLabels = missingFields
  .filter(f => !f.critical)
  .map(f => f.label);
```

И подставлять в `question-generation.md`:

```md
Недостающие КРИТИЧЕСКИЕ аспекты (их надо спросить в первую очередь):
{{ critical_labels_joined }}

Недостающие ВТОРОСТЕПЕННЫЕ аспекты (спрашивай только если критических уже нет):
{{ non_critical_labels_joined }}

Твоя задача — задать один следующий вопрос, который объединяет сразу несколько из этих недостающих аспектов. 
Не задавай вопросы по темам, которые уже присутствуют в истории вопросов и ответов.
Максимум допустимых вопросов во всём диалоге — 4–5. 
Если по КРИТИЧЕСКИМ аспектам уже достаточно информации для старта, верни текст: "Вопросов больше нет".
```

---

## 4. Новая логика `checkContextCompletion`

В `checkContextCompletion`:

1. Снова вызываем `computeMissingFields(document_type, qa_context)`.
2. Правила до LLM:

```ts
const missingFields = computeMissingFields(document_type, qa_context);

const critical = missingFields.filter(f => f.critical);
const nonCritical = missingFields.filter(f => !f.critical);

if (critical.length === 0) {
  // Все критические поля покрыты → можно завершать
  return { is_complete: true, reason: 'Все критические аспекты заполнены локальной логикой' };
}

if (qa_context.length >= HARD_LIMIT) {
  // Пользователь устал, у нас есть некий минимум → жёстко завершаем
  return { is_complete: true, reason: 'Достигнут лимит вопросов, критических дыр немного' };
}
```

3. Только если `critical.length > 0` и `qa_context.length < HARD_LIMIT` — имеет смысл звать LLM, чтобы он решал, действительно ли ещё нужен вопрос.

В промпт `context-completion.md` подставлять список критичных полей, которые по нашему мнению ещё не покрыты, и просить модель подтвердить или опровергнуть:

```md
Ниже список критических аспектов, которые, по предварительной оценке, ещё не покрыты:
{{ critical_labels_joined }}

Если хотя бы часть этих аспектов раскрыта в истории вопросов и ответов, ты можешь считать контекст достаточным для генерации структуры документа (skeleton).
Если информации явно не хватает, верни is_complete = false и объясни, какой именно критический аспект нельзя восстановить даже приблизительно.
```

---

## 5. Ограничения по количеству вопросов

Вместо текущих 7:

* завести `HARD_LIMIT = 4 или 5`,
* использовать **комбинацию**:

  * `HARD_LIMIT` по `qa_context.length`,
  * отсутствие критичных `missing_fields`.

Итого цикл:

```txt
1) computeMissingFields
2) если нет критичных → завершить
3) если вопросов уже >= HARD_LIMIT → завершить
4) иначе → сгенерировать следующий вопрос (агрегирующий)
```

---

## 6. Результат для UX

После этих изменений:

* В среднем пользователь ответит на 2–4 вопроса.
* Вопросы будут более “толстыми”: один вопрос = сразу несколько важных аспектов.
* Skeleton всегда генерируется **после** того, как покрыты критичные поля из профиля для данного типа документа.
* LLM не сможет бесконечно придумывать второстепенные вопросы — локальная логика режет процесс по критичности полей и лимиту вопросов.
