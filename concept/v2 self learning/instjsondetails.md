Вот формулировка задания, которую можно целиком отдать Cursor’у. Код писать не нужно — только требования, контракты и поведение.

---

## Задание: Хранение инструкций в Pinecone для индекса `instructions`

### 1. Цель

Стандартизировать, как мы сохраняем **инструкции по документу** в Pinecone, с учётом ограничений Pinecone по `metadata`:

* `metadata` — **только плоские поля** (string/number/bool/array of strings),
* сложные объекты и массивы — **только как JSON-строки**.

Нужно:

1. Описать единый контракт `Instruction` (доменная модель).
2. Описать контракт `PineconeInstructionMetadata` (то, что реально лежит в `metadata`).
3. Реализовать сериализацию/десериализацию между ними.
4. Фиксированно описать, какой текст мы эмбеддим в `values`.

---

### 2. Доменная модель инструкции

Создать/уточнить общий тип (в shared-модуле):

```ts
// Доменная модель инструкции, с которой работает UI и бэкенд
type Instruction = {
  documentType: string;              // "Договор купли-продажи автомобиля"
  jurisdiction: string;              // "RU"
  whenToUse: string;                 // краткое текстовое описание "когда использовать"

  requiredUserInputs: string[];      // список вопросов/полей
  recommendedStructure: Array<{
    sectionKey: string;              // "price_and_payment"
    title: string;                   // "Цена и порядок расчётов"
    description: string;             // текстовое описание
    isMandatory: boolean;            // обязательный раздел или опциональный
  }>;

  styleHints: {
    tone: string;                    // "neutral_business"
    riskProfile: string;             // "balanced" | ...
    mustHaveSections: string[];      // ключи обязательных разделов
    notes: string[];                 // текстовые комментарии/гайдлайны
  };

  placeholdersUsed: string[];        // ["{CONTRACT_ДОГОВОР}", "{OBJECT_АВТОМОБИЛЬ}", ...]
  instructionQuality: 'high' | 'medium' | 'low';
};
```

> Важно: это **объект для приложения**. Он не обязан быть «плоским», с ним работает UI и бэкенд.

---

### 3. Модель метаданных для Pinecone

Создать тип для `metadata` записей в индексе `instructions`:

```ts
// То, что реально лежит в metadata Pinecone
type PineconeInstructionMetadata = {
  // Ключевые поля для фильтров и быстрых просмотров
  documentType: string;          // человекочитаемое имя типа документа
  jurisdiction: string;          // "RU"
  language: string;              // "ru"

  whenToUse: string;             // короткое описание (дублирует Instruction.whenToUse)
  instructionQuality: string;    // "high" | "medium" | "low"
  version: number;               // версия инструкции
  usage_count: number;           // сколько раз инструкция уже использовалась
  createdAt: string;             // ISO-строка даты

  // Вся полная инструкция в виде JSON-строки
  fullInstruction: string;       // JSON.stringify(Instruction)
};
```

**Требования:**

* `metadata` не должно содержать вложенных объектов.
* `fullInstruction` — **единственное место**, где лежит вся сложная структура `Instruction`.
* При чтении из Pinecone мы всегда делаем `JSON.parse(metadata.fullInstruction)` и работаем с нормальным `Instruction`.

---

### 4. Формирование текста для эмбеддинга

Нужно зафиксировать функцию (Cursor напишет код) для построения строки, по которой считаем embedding:

```ts
// Псевдосигнатура
function buildInstructionEmbeddingText(instruction: Instruction): string;
```

**Логика:**

* Строка должна включать:

  * `documentType`
  * `jurisdiction`
  * `whenToUse`
  * заголовки всех разделов из `recommendedStructure.title`

**Пример формата строки:**

```text
Тип документа: Договор купли-продажи автомобиля.
Юрисдикция: RU.
Когда использовать: Документ используется при передаче права собственности на автомобиль от одного физического лица другому за плату...
Разделы: Стороны договора; Термины и определения; Предмет договора; Описание автомобиля; Цена и порядок расчетов; Порядок передачи и переход права собственности; Права и обязанности Сторон; Ответственность Сторон; Применимое право и разрешение споров; Прочие условия; Подписи Сторон.
```

Эта строка:

* отдаётся в embedding-модель,
* результат (`number[]`) кладётся в `values` записи Pinecone.

---

### 5. Функция upsert-инструкции в Pinecone

Нужно описать функцию (Cursor реализует):

```ts
// Псевдосигнатура
async function upsertInstructionToPinecone(params: {
  instruction: Instruction;
  id?: string;              // если не передан — генерируем UUID
  version?: number;         // по умолчанию 1
}): Promise<{ id: string }>;
```

**Шаги внутри функции:**

1. Определить `id` (использовать переданный или сгенерировать UUID).
2. Вызвать `buildInstructionEmbeddingText(instruction)` и получить `embedding`.
3. Собрать `PineconeInstructionMetadata`:

   * `documentType` = `instruction.documentType`
   * `jurisdiction` = `instruction.jurisdiction`
   * `language` = `"ru"` (пока фикс)
   * `whenToUse` = `instruction.whenToUse`
   * `instructionQuality` = `instruction.instructionQuality`
   * `version` = `version ?? 1`
   * `usage_count` = `0` (на момент создания)
   * `createdAt` = `new Date().toISOString()`
   * `fullInstruction` = `JSON.stringify(instruction)`
4. Вызвать Pinecone `upsert` в индекс `instructions` с:

   * `id`
   * `values` = `embedding`
   * `metadata` = сформированный `PineconeInstructionMetadata`.

**Условие:** никаких вложенных объектов в `metadata` кроме `fullInstruction`-строки.

---

### 6. Функция чтения инструкции из результата Pinecone

Нужно описать функцию (Cursor реализует):

```ts
// Псевдосигнатура
function mapPineconeMatchToInstruction(match: {
  id: string;
  score?: number;
  metadata?: PineconeInstructionMetadata;
}): { id: string; score?: number; instruction: Instruction };
```

**Поведение:**

1. Проверить, что `metadata.fullInstruction` есть и является строкой.
2. Сделать `JSON.parse(metadata.fullInstruction)` → получить `Instruction`.
3. Вернуть объект с:

   * `id`
   * `score` (если был)
   * `instruction` (десериализованный).

Если парсинг `fullInstruction` падает — логировать ошибку, но это можно оформить как TODO.

---

### 7. Ограничения и проверки

* Убедиться, что суммарный размер `metadata` (включая `fullInstruction`) не превышает лимит Pinecone (ориентир — ~40KB).
  На первом этапе достаточно:

  * не складывать туда лишние поля,
  * не дублировать большие тексты в нескольких полях.
* Запретить вложенные объекты в `metadata`, кроме сериализованной строки `fullInstruction`.

---

### 8. Кратко: что уже есть и что сделать

**Уже есть:**

* Реализован фикс: «сложные объекты сериализуем в JSON-строки, полная инструкция хранится в `fullInstruction`».

**Нужно:**

1. Явно зафиксировать в коде типы `Instruction` и `PineconeInstructionMetadata` в одном месте (shared).
2. Вынести логику построения текста для эмбеддинга в отдельную функцию `buildInstructionEmbeddingText`.
3. Описать и реализовать `upsertInstructionToPinecone` по схеме выше.
4. Описать и реализовать `mapPineconeMatchToInstruction` для чтения из Pinecone.

---

Этого задания должно хватить, чтобы Cursor:

* поддерживал текущий фикс с JSON-строкой,
* но делал это по **ясному, стабильному контракту**, который ты дальше сможешь использовать и в UI, и в RAG.
