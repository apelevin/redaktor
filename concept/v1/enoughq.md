Сейчас у тебя уже есть то, что нам нужно для остановки: **структурированный контекст** (огромный JSON) и дерево вопросов. Осталось договориться о правилах: когда мы говорим «хватит, можно генерировать договор», а когда ещё чуть-чуть дожимаем пользователя.

Я предложу **гибридную схему**:

1. Жёсткий критерий: все обязательные поля заполнены → можно гарантированно формировать договор.
2. Мягкий критерий: есть ещё важные, но не критичные вопросы → агент предлагает их, но даёт явный выбор «идём дальше или уточняем».
3. В интерфейсе всегда есть кнопка **«Сформировать договор»**, но она активируется только после выполнения жёсткого критерия.

Ниже — как это реализовать технически.

---

## 1. Добавляем уровни важности вопросов

К текущей модели `Question` добавляем поле:

```ts
type RequiredLevel = 'must' | 'recommended' | 'optional';

interface Question {
  id: string;
  documentType: string;
  text: string;
  uiKind: 'open' | 'single' | 'multi';
  valueType: string;
  isRequired: boolean;          // можно оставить для back-compat
  requiredLevel: RequiredLevel; // NEW: must / recommended / optional
  affects: string[];
  dependsOn?: string[];
  order?: number;
}
```

Смысл:

* `must` — без этого нельзя безопасно собирать договор (типы сторон, сумма, предмет, срок, применимое право и т.п.).
* `recommended` — полезные юридически важные уточнения (штрафы, лимит ответственности, подробные условия ПДн, SLA и т.п.).
* `optional` — косметика и экзотика (количество экземпляров, дополнительные уведомления, спец. стилистика и т.п.).

---

## 2. Как понять, что вопрос “закрыт”

У тебя уже есть контекст вида:

```json
{
  "service_contract.parties.customer_type": "Физическое лицо",
  ...
}
```

Для каждого `Question.affects` мы проверяем, что в контексте есть не-пустое значение.

Пример функции:

```ts
function isQuestionAnswered(q: Question, context: Record<string, any>): boolean {
  return q.affects.every(path => {
    const value = get(context, path); // lodash.get
    return value !== undefined && value !== null && value !== '';
  });
}
```

---

## 3. Метрика “насыщенность контекста”

После каждого ответа считаем:

```ts
interface CompletionState {
  mustTotal: number;
  mustAnswered: number;
  recommendedTotal: number;
  recommendedAnswered: number;
  optionalTotal: number;
  optionalAnswered: number;

  mustCompleted: boolean;          // mustAnswered === mustTotal
  recommendedCoverage: number;     // 0..1
  overallCoverage: number;         // взвешенный показатель
}
```

Пример простого расчёта:

```ts
function calcCompletionState(
  questions: Question[],
  context: Record<string, any>
): CompletionState {
  const state: CompletionState = {
    mustTotal: 0,
    mustAnswered: 0,
    recommendedTotal: 0,
    recommendedAnswered: 0,
    optionalTotal: 0,
    optionalAnswered: 0,
    mustCompleted: false,
    recommendedCoverage: 0,
    overallCoverage: 0,
  };

  for (const q of questions) {
    const answered = isQuestionAnswered(q, context);
    if (q.requiredLevel === 'must') {
      state.mustTotal += 1;
      if (answered) state.mustAnswered += 1;
    } else if (q.requiredLevel === 'recommended') {
      state.recommendedTotal += 1;
      if (answered) state.recommendedAnswered += 1;
    } else {
      state.optionalTotal += 1;
      if (answered) state.optionalAnswered += 1;
    }
  }

  state.mustCompleted = state.mustTotal > 0 && state.mustAnswered === state.mustTotal;
  state.recommendedCoverage =
    state.recommendedTotal === 0 ? 1 : state.recommendedAnswered / state.recommendedTotal;

  // простой общий скोर: must*0.6 + recommended*0.3 + optional*0.1
  const mustScore =
    state.mustTotal === 0 ? 1 : state.mustAnswered / state.mustTotal;
  const optScore =
    state.optionalTotal === 0 ? 1 : state.optionalAnswered / state.optionalTotal;

  state.overallCoverage =
    mustScore * 0.6 +
    state.recommendedCoverage * 0.3 +
    optScore * 0.1;

  return state;
}
```

---

## 4. Правило остановки (логика агента)

### 4.1. Жёсткий порог

Если:

```ts
state.mustCompleted === true
```

→ **агент гарантированно может сформировать договор**.

С этого момента:

* на UI:

  * кнопка «Сформировать договор» становится активной;
  * показываем статус типа «Ключевые параметры собраны».

Если `mustCompleted === false` → продолжаем спрашивать только `must`-вопросы.

---

### 4.2. Мягкий порог (предложение пользователю)

Когда `mustCompleted === true`, но ещё есть неотвеченные `recommended`:

1. Находим список ближайших рекомендованных вопросов:

```ts
const remainingRecommended = questions.filter(
  q => q.requiredLevel === 'recommended' && !isQuestionAnswered(q, context)
);
```

2. Можно отсортировать по важности (дополнительное поле `importanceScore`) и взять топ-3–5.

3. Агент формирует **мета-вопрос** пользователю:

Текст примерно такой (генерится LLM):

> Я собрал все ключевые данные и уже могу составить договор.
> При этом, чтобы договор был более “юридически плотным”, можно ещё уточнить:
> – ответственность и штрафы;
> – условия расторжения;
> – детализацию обработки персональных данных.
>
> Что делаем дальше?

И даёт два действия:

* `primary`: **«Сформировать договор»**
* `secondary`: **«Продолжить уточнение (ещё 3 вопроса)»**

С точки зрения кода это может быть:

```ts
type NextStep =
  | { kind: 'askMore'; questions: Question[] }
  | { kind: 'generateContract' };

function decideNextStep(state: CompletionState, questions: Question[], context: any): NextStep {
  if (!state.mustCompleted) {
    // ищем следующий обязательный вопрос
    const nextMust = questions.find(
      q => q.requiredLevel === 'must' && !isQuestionAnswered(q, context)
    );
    return { kind: 'askMore', questions: nextMust ? [nextMust] : [] };
  }

  // must закрыты: можно генерировать договор
  const remainingRecommended = questions.filter(
    q => q.requiredLevel === 'recommended' && !isQuestionAnswered(q, context)
  );

  if (remainingRecommended.length === 0) {
    // вообще нечего уточнять
    return { kind: 'generateContract' };
  }

  // есть что уточнить — предлагаем выбор пользователю
  const topQuestions = remainingRecommended.slice(0, 3); // или по importanceScore
  return { kind: 'askMore', questions: topQuestions };
}
```

На фронте:

* всегда показываем кнопку «Сформировать договор»,
* но до `mustCompleted === true` она disabled + tooltip «Нужно ответить на ещё N ключевых вопросов».

---

## 5. Как здесь встроить LLM

LLM тут нужен не для самого критерия остановки (он у нас формальный), а для:

1. **Человеческой формулировки “контекст уже достаточно хороший”**:

   * мы передаём LLM `completionState` и список оставшихся recommended;
   * он формирует короткое объяснение, что уже собрано и что ещё можно улучшить.

2. **Краткого перечисления, что именно он ещё хочет уточнить**:

   * LLM получает `remainingRecommended` (id + text + affects);
   * возвращает список “тем”: *ответственность*, *расторжение*, *персональные данные*.

Пример системного промпта для мета-вопроса:

```text
Ты — юридический ассистент. У тебя есть:
- completionState (must/recommended/optional coverage),
- список оставшихся рекомендованных вопросов (remainingRecommended).

Задача:
1) Одной-двумя фразами сказать пользователю, что ключевых данных достаточно для составления договора.
2) Коротко перечислить 2–4 блока, которые можно дополнительно уточнить.
3) Предложить выбор: 
   - либо сразу переход к созданию договора,
   - либо ответить ещё на несколько уточняющих вопросов.

Ответ верни в JSON:
{
  "message": "текст для пользователя",
  "summaryTopics": ["ответственность", "расторжение"],
  "buttons": [
    { "id": "generate", "label": "Сформировать договор" },
    { "id": "continue", "label": "Продолжить уточнение (еще 3 вопроса)" }
  ]
}
```

---

## 6. Что делать именно с таким контекстом, как у тебя в примере

Твой JSON по факту уже:

* отвечает на все ключевые вещи: стороны, предмет, цена, срок, IP, ПДн, порядок приёмки, место суда, применимое право, подписи и т.д.;
* многие ответы — это сознательные решения «Нет, достаточно общих норм закона», т.е. это **не отсутствие данных**, а выбранная стратегия.

По нашей логике:

* все `must` закрыты;
* подавляющая часть `recommended` тоже;
* `completionState.overallCoverage` будет близко к 1.

Значит:

1. Агент должен **активировать кнопку “Сформировать договор”**.
2. Может дополнительно предложить:

   * например, уточнить ограничения ответственности или условия расторжения (если ты их пометишь как `recommended` и оставишь незаполненными).
3. Если пользователь жмёт “создать договор” — мы **немедленно** строим скелет и переходим к генерации текста.

---

## 7. Короткое резюме для вставки в Cursor

Если нужно прямо кратко, вот текстовый блок:

> **Правило остановки вопросов**
>
> 1. У каждого вопроса есть `requiredLevel`:
>    – `must` (ключевые),
>    – `recommended` (желательные),
>    – `optional` (необязательные).
> 2. После каждого ответа считаем `completionState`:
>    – `mustCompleted = (все must-вопросы заполнены)`.
> 3. Пока `mustCompleted === false` — задаём только оставшиеся `must`-вопросы, кнопка «Сформировать договор» отключена.
> 4. Когда `mustCompleted === true`:
>    – кнопка «Сформировать договор» становится активной;
>    – если остались `recommended`, агент формирует мета-вопрос:
>    «Я уже могу составить договор. Можно также уточнить ещё N важных моментов (ответственность, расторжение, ПДн). Хотите продолжить или перейти к договору?»
>    – пользователь выбирает:
>
>    * **«Сформировать договор»** → сразу генерируем скелет и текст;
>    * **«Продолжить уточнение»** → задаём ещё 3–5 рекомендованных вопросов.
> 5. Отсутствие ответа — это отсутствие данных. Ответ вида «Нет, достаточно общих норм закона» считается заполненным значением и учитывается как осознанный выбор.

Так у тебя и ИИ понимает, когда “хватит спрашивать”, и у пользователя остаётся контроль — он в любой момент после минимального порога может сказать: «Всё, давай уже договор».
