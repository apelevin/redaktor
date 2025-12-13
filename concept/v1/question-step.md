# Логика реализации первого шага: сбор контекста через уточняющие вопросы

## Обзор

Первый шаг пайплайна отвечает за сбор минимально достаточного юридического контекста для создания документа через итеративный диалог с пользователем. Система задает уточняющие вопросы, получает ответы и определяет момент, когда собранной информации достаточно для перехода к следующему этапу.

## Архитектура компонентов

### 1. Frontend: ChatPanel.tsx

**Расположение:** `app/components/ChatPanel.tsx`

**Ответственность:**
- Отображение интерфейса чата с вопросами и ответами
- Управление состоянием диалога
- Обработка пользовательских ответов
- Координация переходов между этапами пайплайна

**Ключевые состояния:**
- `stage: PipelineStage` — текущий этап пайплайна (`initial` → `collecting_context` → `generating_skeleton` → ...)
- `currentQuestion: string | null` — текущий вопрос, на который ожидается ответ
- `messages: Message[]` — история сообщений для отображения
- `qa_context: QAContext[]` — накопленный контекст вопросов/ответов (хранится в Zustand store)

**Основные функции:**

```125:175:app/components/ChatPanel.tsx
  const askNextQuestion = async (docType?: string) => {
    const currentDocType = docType || document_type;
    
    if (!currentDocType) {
      addMessage('system', 'Ошибка: тип документа не указан');
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch('/api/pipeline/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type: currentDocType,
          jurisdiction,
          style,
          qa_context: qa_context || [],
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      
      const data = await res.json();
      
      // Обрабатываем данные об использовании токенов
      if (data.usage && data.model) {
        handleUsageData(data.usage, data.model, 'question_generation');
      }
      if (data.completion_usage && data.completion_model) {
        handleUsageData(data.completion_usage, data.completion_model, 'context_completion');
      }
      
      if (data.is_complete) {
        addMessage('system', 'Контекст собран. Генерируем структуру документа...');
        await generateSkeleton();
      } else if (data.question) {
        setCurrentQuestion(data.question);
        addMessage('question', data.question);
      }
    } catch (error) {
      console.error('Error asking question:', error);
      const errorMessage = error instanceof Error ? error.message : 'Ошибка при генерации вопроса';
      addMessage('system', `Ошибка: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };
```

```177:232:app/components/ChatPanel.tsx
  const handleAnswerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim() || !currentQuestion) return;
    
    addMessage('answer', answer);
    addQAContext({ question: currentQuestion, answer });
    setAnswer('');
    setCurrentQuestion(null);
    
    // Проверяем, нужен ли еще вопрос
    setLoading(true);
    try {
      const res = await fetch('/api/pipeline/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type,
          jurisdiction,
          style,
          qa_context: [...(qa_context || []), { question: currentQuestion, answer }],
          action: 'check_completion',
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      
      const data = await res.json();
      
      // Обрабатываем данные об использовании токенов
      if (data.usage && data.model) {
        handleUsageData(data.usage, data.model, 'context_completion');
      }
      
      if (data.is_complete) {
        addMessage('system', 'Контекст собран. Генерируем структуру документа...');
        await generateSkeleton();
      } else {
        await askNextQuestion();
      }
    } catch (error) {
      console.error('Error checking completion:', error);
      const errorMessage = error instanceof Error ? error.message : 'Ошибка при проверке';
      addMessage('system', `Ошибка: ${errorMessage}`);
      // Пытаемся продолжить с следующим вопросом
      try {
        await askNextQuestion();
      } catch {
        setLoading(false);
      }
    } finally {
      setLoading(false);
    }
  };
```

**Поток работы:**
1. Пользователь инициирует создание документа → вызывается `startNewDocument()`
2. Если инструкция не найдена → переход в `collecting_context` и вызов `askNextQuestion()`
3. После получения вопроса → отображение в UI, ожидание ответа пользователя
4. После отправки ответа → вызов `handleAnswerSubmit()`:
   - Сохранение ответа в store через `addQAContext()`
   - Проверка завершенности контекста через API с `action: 'check_completion'`
   - Если контекст завершен → переход к генерации skeleton
   - Если нет → запрос следующего вопроса через `askNextQuestion()`

### 2. API Route: /api/pipeline/context/route.ts

**Расположение:** `app/api/pipeline/context/route.ts`

**Ответственность:**
- Обработка HTTP запросов для генерации вопросов и проверки завершенности
- Маршрутизация между двумя операциями: генерация вопроса и проверка завершенности

**Обрабатываемые параметры:**
- `document_type: string` (обязательный)
- `jurisdiction?: string`
- `style?: string`
- `qa_context: QAContext[]` (массив вопросов/ответов)
- `action?: 'generate_question' | 'check_completion'` (по умолчанию `generate_question`)

**Логика обработки:**

```7:67:app/api/pipeline/context/route.ts
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      document_type,
      jurisdiction,
      style,
      qa_context,
      action, // 'generate_question' | 'check_completion'
    } = body;
    
    if (!document_type) {
      return NextResponse.json(
        { error: 'document_type is required' },
        { status: 400 }
      );
    }
    
    const params = {
      document_type,
      jurisdiction,
      style,
      qa_context: qa_context || [],
    };
    
    if (action === 'check_completion') {
      const result = await checkContextCompletion(params);
      return NextResponse.json(result);
    } else {
      // generate_question (default)
      const result = await generateNextQuestion(params);
      
      if (!result.question) {
        // Проверяем, завершен ли контекст
        const completion = await checkContextCompletion(params);
        return NextResponse.json({
          question: null,
          is_complete: completion.is_complete,
          reason: completion.reason,
          usage: result.usage,
          model: result.model,
          completion_usage: completion.usage,
          completion_model: completion.model,
        });
      }
      
      return NextResponse.json({
        question: result.question,
        is_complete: false,
        usage: result.usage,
        model: result.model,
      });
    }
  } catch (error) {
    console.error('Error in context route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**Особенности:**
- При генерации вопроса, если модель вернула `null` (сигнал о завершении), автоматически вызывается проверка завершенности
- Возвращаются данные об использовании токенов для расчета стоимости (`usage`, `model`, `completion_usage`, `completion_model`)

### 3. Question Generator: lib/openai/question-generator.ts

**Расположение:** `lib/openai/question-generator.ts`

**Ответственность:**
- Генерация следующего уточняющего вопроса на основе накопленного контекста
- Проверка достаточности собранной информации для создания документа

#### 3.1. Генерация вопроса: `generateNextQuestion()`

**Параметры:**
```6:11:lib/openai/question-generator.ts
export interface QuestionGenerationParams {
  document_type: string;
  jurisdiction?: string;
  style?: string;
  qa_context: Array<{ question: string; answer: string }>;
}
```

**Ограничения:**
- Максимальное количество вопросов: **7** (`MAX_QUESTIONS = 7`)
- Если достигнут лимит → возвращается `question: null`

**Логика работы:**

```21:90:lib/openai/question-generator.ts
export async function generateNextQuestion(
  params: QuestionGenerationParams
): Promise<QuestionGenerationResult> {
  // Ограничение на максимальное количество вопросов
  if (params.qa_context.length >= MAX_QUESTIONS) {
    return {
      question: null,
    };
  }
  
  const client = getOpenAIClient();
  
  // Форматируем qa_context для промпта
  const qaContextText = params.qa_context
    .map(qa => `В: ${qa.question}\nО: ${qa.answer}`)
    .join('\n\n');
  
  const prompt = await loadAndRenderPrompt('question-generation.md', {
    document_type: params.document_type,
    jurisdiction: params.jurisdiction ? `Юрисдикция: ${params.jurisdiction}` : '',
    style: params.style ? `Стиль: ${params.style}` : '',
    qa_context: qaContextText || 'Пока нет вопросов и ответов.',
  });
  
  try {
    const modelConfig = getModelConfig('question_generation');
    
    const response = await client.chat.completions.create({
      model: modelConfig.model,
      messages: [
        {
          role: 'system',
          content: 'Ты юридический ассистент, который помогает собирать контекст для создания документов.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      ...(modelConfig.reasoning_effort && modelConfig.reasoning_effort !== 'none' && { 
        reasoning_effort: modelConfig.reasoning_effort as 'low' | 'medium' | 'high' 
      }),
      ...(modelConfig.verbosity && { verbosity: modelConfig.verbosity }),
    });
    
    const question = response.choices[0]?.message?.content?.trim();
    
    // Возвращаем данные об использовании токенов для расчета стоимости на клиенте
    const usage: TokenUsage | undefined = response.usage ? {
      prompt_tokens: response.usage.prompt_tokens || 0,
      completion_tokens: response.usage.completion_tokens || 0,
      total_tokens: response.usage.total_tokens || 0,
      cached_tokens: (response.usage as any).cached_tokens || 0,
    } : undefined;
    
    // Если модель вернула пустой ответ или сигнал о завершении, возвращаем null
    const finalQuestion = (!question || question.toLowerCase().includes('вопросов больше нет')) 
      ? null 
      : question;
    
    return {
      question: finalQuestion,
      usage,
      model: modelConfig.model,
    };
  } catch (error) {
    console.error('Error generating question:', error);
    throw error;
  }
}
```

**Особенности:**
- Форматирование истории Q&A в текстовый формат для промпта
- Использование промпта из `prompts/question-generation.md` с подстановкой переменных
- Обработка сигнала завершения: если модель возвращает "вопросов больше нет" или пустой ответ → `null`
- Возврат метаданных об использовании токенов для расчета стоимости

#### 3.2. Проверка завершенности: `checkContextCompletion()`

**Параметры:** те же, что и для генерации вопроса

**Логика работы:**

```99:164:lib/openai/question-generator.ts
export async function checkContextCompletion(
  params: QuestionGenerationParams
): Promise<ContextCompletionResult> {
  const client = getOpenAIClient();
  
  const qaContextText = params.qa_context
    .map(qa => `В: ${qa.question}\nО: ${qa.answer}`)
    .join('\n\n');
  
  const prompt = await loadAndRenderPrompt('context-completion.md', {
    document_type: params.document_type,
    jurisdiction: params.jurisdiction ? `Юрисдикция: ${params.jurisdiction}` : '',
    qa_context: qaContextText || 'Пока нет вопросов и ответов.',
  });
  
  try {
    const modelConfig = getModelConfig('context_completion');
    
    const response = await client.chat.completions.create({
      model: modelConfig.model,
      messages: [
        {
          role: 'system',
          content: 'Ты юридический ассистент, который определяет, достаточно ли собрано информации для создания документа. Всегда возвращай валидный JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      ...(modelConfig.reasoning_effort && modelConfig.reasoning_effort !== 'none' && { 
        reasoning_effort: modelConfig.reasoning_effort as 'low' | 'medium' | 'high' 
      }),
      ...(modelConfig.verbosity && { verbosity: modelConfig.verbosity }),
      response_format: { type: 'json_object' },
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { is_complete: false, reason: 'Не удалось получить ответ' };
    }
    
    // Возвращаем данные об использовании токенов для расчета стоимости на клиенте
    const usage: TokenUsage | undefined = response.usage ? {
      prompt_tokens: response.usage.prompt_tokens || 0,
      completion_tokens: response.usage.completion_tokens || 0,
      total_tokens: response.usage.total_tokens || 0,
      cached_tokens: (response.usage as any).cached_tokens || 0,
    } : undefined;
    
    try {
      const result = JSON.parse(content);
      return {
        is_complete: result.is_complete === true,
        reason: result.reason,
        usage,
        model: modelConfig.model,
      };
    } catch {
      return { is_complete: false, reason: 'Ошибка парсинга ответа', usage, model: modelConfig.model };
    }
  } catch (error) {
    console.error('Error checking context completion:', error);
    return { is_complete: false, reason: 'Ошибка при проверке' };
  }
}
```

**Особенности:**
- Использование JSON response format для структурированного ответа
- Промпт из `prompts/context-completion.md` настроен на "агрессивное" завершение сбора контекста
- Возвращает `is_complete: boolean` и `reason: string` для объяснения решения

### 4. Промпты

#### 4.1. Генерация вопроса: prompts/question-generation.md

**Стратегия:**
- Приоритизация критически важной информации
- Объединение связанных аспектов в один комплексный вопрос
- Избегание вопросов о деталях, которые можно указать позже
- Максимум 5-7 вопросов

**Ключевые инструкции:**
```
**ВАЖНО:** Максимальное количество вопросов - 5-7. Сфокусируйся только на критически важной информации.

**Стратегия:**
1. Приоритизируй критически важную информацию для данного типа документа
2. Объединяй связанные аспекты в один комплексный вопрос
3. Не задавай вопросы о деталях, которые можно указать в самом документе позже
4. Если уже собрана базовая информация - верни "Вопросов больше нет"
```

#### 4.2. Проверка завершенности: prompts/context-completion.md

**Стратегия:**
- "Агрессивное" завершение сбора контекста
- Фокус на базовой информации, достаточной для создания документа
- Не требовать излишних деталей

**Критерии достаточности:**
- Есть базовая информация о сторонах (если применимо)
- Есть ключевые параметры договора (предмет, сроки, цена - если применимо)
- Есть минимально необходимая информация для формирования структуры документа

### 5. Конфигурация моделей: lib/openai/models.ts

**Модели по умолчанию:**

```20:41:lib/openai/models.ts
const defaultModelConfig: Record<PipelineStep, ModelConfig> = {
  question_generation: {
    model: 'gpt-5-mini',
    reasoning_effort: 'low',
    verbosity: 'medium',
  },
  context_completion: {
    model: 'gpt-5-mini',
    reasoning_effort: 'medium',
    verbosity: 'low',
  },
  skeleton_generation: {
    model: 'gpt-5.1',
    reasoning_effort: 'medium',
    verbosity: 'medium',
  },
  clause_generation: {
    model: 'gpt-5.1',
    reasoning_effort: 'medium',
    verbosity: 'high',
  },
};
```

**Особенности:**
- Для генерации вопросов используется более легкая модель (`gpt-5-mini`) с низким reasoning effort
- Для проверки завершенности — та же модель, но с medium reasoning effort
- Поддержка переопределения через переменные окружения

### 6. State Management: lib/pipeline/state.ts

**Хранение данных:**
- `qa_context: QAContext[]` — массив вопросов/ответов
- `document_type: string` — тип документа
- `jurisdiction?: string` — юрисдикция
- `style?: string` — стиль документа
- `cost_records: CostRecord[]` — записи о стоимости для каждого шага

**Методы:**
- `addQAContext(qa: QAContext)` — добавление нового вопроса/ответа
- `reset()` — сброс всего состояния

## Поток данных

### Инициализация

1. Пользователь нажимает "Новый документ"
2. Вводится тип документа
3. Проверяется наличие инструкции (`/api/pipeline/instruction`)
4. Если инструкции нет → переход к сбору контекста

### Цикл сбора контекста

```
┌─────────────────────────────────────────────────────────┐
│ 1. askNextQuestion()                                    │
│    → POST /api/pipeline/context                         │
│    → generateNextQuestion()                             │
│    → LLM генерирует вопрос                              │
│    → Возврат вопроса в UI                               │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Пользователь вводит ответ                            │
│    → handleAnswerSubmit()                               │
│    → addQAContext() в store                             │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Проверка завершенности                               │
│    → POST /api/pipeline/context (action: check_completion)│
│    → checkContextCompletion()                           │
│    → LLM определяет достаточность                       │
└─────────────────────────────────────────────────────────┘
                        ↓
        ┌───────────────┴───────────────┐
        ↓                               ↓
┌───────────────┐              ┌───────────────┐
│ is_complete   │              │ !is_complete   │
│ = true        │              │ = false        │
└───────────────┘              └───────────────┘
        ↓                               ↓
┌───────────────┐              ┌───────────────┐
│ Переход к     │              │ askNextQuestion│
│ генерации     │              │ (повтор цикла) │
│ skeleton      │              └───────────────┘
└───────────────┘
```

### Ограничения и защита

1. **Жесткий лимит вопросов:** максимум 7 вопросов (проверка в `generateNextQuestion()`)
2. **Сигнал от модели:** модель может вернуть "вопросов больше нет" → `question: null`
3. **Автоматическая проверка:** если `question: null`, автоматически вызывается `checkContextCompletion()`
4. **Двойная проверка:** после каждого ответа вызывается проверка завершенности

## Обработка ошибок

- **Ошибки API:** отображаются в UI через `addMessage('system', errorMessage)`
- **Ошибки парсинга JSON:** в `checkContextCompletion()` возвращается `is_complete: false` с описанием ошибки
- **Fallback:** при ошибке проверки завершенности система пытается продолжить с следующим вопросом

## Учет стоимости

На каждом шаге собираются данные об использовании токенов:
- `usage: TokenUsage` — количество токенов (prompt, completion, total, cached)
- `model: string` — использованная модель
- Данные сохраняются в `cost_records` через `addCostRecord()`
- Общая стоимость отображается в UI

## Интеграция с другими шагами

После завершения сбора контекста:
- `qa_context` передается в генерацию skeleton (`/api/pipeline/skeleton`)
- Далее используется при генерации клауз (`/api/pipeline/clause`)
- Хранится в глобальном состоянии для доступа на всех этапах

