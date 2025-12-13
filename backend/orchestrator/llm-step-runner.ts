import { PreSkeletonState, LLMStepOutput, SkeletonReviewAnswer } from '@/lib/types';
import { getOpenRouterClient } from '@/backend/llm/openrouter';
import { validate, getSchema } from '@/backend/schemas/schema-registry';
import { loadPrompt } from '@/backend/prompts/prompt-loader';

/**
 * Запускает INTERPRET шаг
 */
export async function runInterpretStep(
  state: PreSkeletonState,
  lastMessage: string
): Promise<LLMStepOutput> {
  const client = getOpenRouterClient();
  
  // Форматируем историю диалога
  const recentHistory = state.dialogue.history
    .slice(-5)
    .map((turn) => `${turn.role === 'user' ? 'Пользователь' : 'Агент'}: ${turn.text}`)
    .join('\n');
  
  // Загружаем промпт
  const prompt = loadPrompt('interpret-step.md', {
    domain_json: JSON.stringify(state.domain, null, 2),
    issues_json: JSON.stringify(state.issues, null, 2),
    recent_history: recentHistory || '(нет истории)',
    last_message: lastMessage,
  });
  
  // Вызываем LLM
  const response = await client.chatJSON<LLMStepOutput>([
    {
      role: 'system',
      content: 'Ты — опытный юрист, специализирующийся на российском законодательстве. Твоя задача — анализировать сообщения пользователя и обновлять состояние договора через структурированные patch операции.',
    },
    {
      role: 'user',
      content: prompt,
    },
  ]);
  
  const llmOutput = response.data;
  
  // Валидируем ответ по схеме (с более мягкой обработкой ошибок)
  const validation = validate(llmOutput, 'schema://legalagi/llm_step_output/1.0.0');
  if (!validation.valid) {
    console.warn('LLM output validation warnings:', validation.errors);
    // Продолжаем выполнение, но логируем предупреждения
    // Можно добавить более строгую валидацию позже
  }
  
  // Убеждаемся, что step = INTERPRET
  if (llmOutput.step !== 'INTERPRET') {
    throw new Error(`Expected step INTERPRET, got ${llmOutput.step}`);
  }
  
  return llmOutput;
}

/**
 * Запускает GATE_CHECK шаг
 */
export async function runGateCheckStep(
  state: PreSkeletonState
): Promise<LLMStepOutput> {
  const client = getOpenRouterClient();
  
  // Загружаем промпт
  const prompt = loadPrompt('gate-check-step.md', {
    state_json: JSON.stringify(state, null, 2),
  });
  
  // Вызываем LLM
  const response = await client.chatJSON<LLMStepOutput>([
    {
      role: 'system',
      content: 'Ты — опытный юрист, специализирующийся на российском законодательстве. Твоя задача — проверить готовность состояния договора к генерации skeleton.',
    },
    {
      role: 'user',
      content: prompt,
    },
  ]);
  
  const llmOutput = response.data;
  
  // Валидируем ответ по схеме (с более мягкой обработкой ошибок)
  const validation = validate(llmOutput, 'schema://legalagi/llm_step_output/1.0.0');
  if (!validation.valid) {
    console.warn('LLM output validation warnings:', validation.errors);
    // Продолжаем выполнение, но логируем предупреждения
    // Можно добавить более строгую валидацию позже
  }
  
  // Убеждаемся, что step = GATE_CHECK
  if (llmOutput.step !== 'GATE_CHECK') {
    throw new Error(`Expected step GATE_CHECK, got ${llmOutput.step}`);
  }
  
  return llmOutput;
}

/**
 * Запускает SKELETON_GENERATE шаг
 */
export async function runSkeletonGenerateStep(
  state: PreSkeletonState
): Promise<LLMStepOutput> {
  const client = getOpenRouterClient();
  
  // Проверяем preconditions
  if (state.meta.stage !== 'pre_skeleton') {
    throw new Error(`Invalid stage for skeleton generation: ${state.meta.stage}`);
  }
  
  if (!state.gate || !state.gate.ready_for_skeleton) {
    throw new Error('Gate check must pass before skeleton generation');
  }
  
  // Загружаем skeleton schema для включения в промпт
  const skeletonSchemaRecord = getSchema('schema://legalagi/contract_skeleton/1.0.0');
  const skeletonSchema = skeletonSchemaRecord?.schema || {};
  
  // Загружаем промпт
  const prompt = loadPrompt('skeleton-generate-step.md', {
    state_json: JSON.stringify(state, null, 2),
    skeleton_schema_json: JSON.stringify(skeletonSchema, null, 2),
    domain_json: JSON.stringify(state.domain, null, 2),
    current_timestamp: new Date().toISOString(),
  });
  
  // Вызываем LLM
  const response = await client.chatJSON<LLMStepOutput>([
    {
      role: 'system',
      content: 'Ты — агент юридической архитектуры документов. Твоя задача — сформировать структурный скелет договора по праву Российской Федерации. Это НЕ генерация текста договора, только структура: разделы, пункты, иерархия и назначение.',
    },
    {
      role: 'user',
      content: prompt,
    },
  ]);
  
  const llmOutput = response.data;
  
  // Валидируем ответ по схеме (с более мягкой обработкой ошибок)
  const validation = validate(llmOutput, 'schema://legalagi/llm_step_output/1.0.0');
  if (!validation.valid) {
    console.warn('LLM output validation warnings:', validation.errors);
    // Продолжаем выполнение, но логируем предупреждения
  }
  
  // Убеждаемся, что step = SKELETON_GENERATE
  if (llmOutput.step !== 'SKELETON_GENERATE') {
    throw new Error(`Expected step SKELETON_GENERATE, got ${llmOutput.step}`);
  }
  
  return llmOutput;
}

/**
 * Запускает SKELETON_REVIEW_PLAN шаг
 */
export async function runSkeletonReviewPlanStep(
  state: PreSkeletonState
): Promise<LLMStepOutput> {
  const client = getOpenRouterClient();
  
  // Проверяем preconditions
  if (state.meta.stage !== 'skeleton_ready' && state.meta.stage !== 'skeleton_review') {
    throw new Error(`Invalid stage for skeleton review plan: ${state.meta.stage}`);
  }
  
  if (!state.document?.skeleton) {
    throw new Error('Skeleton must exist before review planning');
  }
  
  // Загружаем review questions schema для включения в промпт
  const reviewQuestionsSchemaRecord = getSchema('schema://legalagi/skeleton_review_questions/1.0.0');
  const reviewQuestionsSchema = reviewQuestionsSchemaRecord?.schema || {};
  
  // Извлекаем mission из dialogue (первое сообщение пользователя)
  const mission = state.dialogue.history.find(t => t.role === 'user')?.text || '';
  
  // Генерируем review_id если отсутствует
  const reviewId = state.review?.review_id || `rev_${Date.now()}`;
  const iteration = state.review?.iteration || 0;
  
  // Загружаем промпт
  const prompt = loadPrompt('skeleton-review-plan-step.md', {
    state_json: JSON.stringify(state, null, 2),
    mission_json: JSON.stringify({ text: mission }, null, 2),
    domain_json: JSON.stringify(state.domain, null, 2),
    skeleton_draft_json: JSON.stringify(state.document.skeleton, null, 2),
    issues_json: JSON.stringify(state.issues, null, 2),
    review_questions_schema_json: JSON.stringify(reviewQuestionsSchema, null, 2),
    review_iteration: iteration.toString(),
    review_id: reviewId,
  });
  
  // Вызываем LLM
  const response = await client.chatJSON<LLMStepOutput>([
    {
      role: 'system',
      content: 'Ты — агент настройки структуры договора. Твоя задача — сформировать набор UX-вопросов (чекбоксы/радио/ввод), которые помогут пользователю настроить структуру договора.',
    },
    {
      role: 'user',
      content: prompt,
    },
  ]);
  
  const llmOutput = response.data;
  
  // Валидируем ответ по схеме
  const validation = validate(llmOutput, 'schema://legalagi/llm_step_output/1.0.0');
  if (!validation.valid) {
    console.warn('LLM output validation warnings:', validation.errors);
  }
  
  // Убеждаемся, что step = SKELETON_REVIEW_PLAN
  if (llmOutput.step !== 'SKELETON_REVIEW_PLAN') {
    throw new Error(`Expected step SKELETON_REVIEW_PLAN, got ${llmOutput.step}`);
  }
  
  return llmOutput;
}

/**
 * Запускает SKELETON_REVIEW_APPLY шаг
 */
export async function runSkeletonReviewApplyStep(
  state: PreSkeletonState,
  answers: SkeletonReviewAnswer[]
): Promise<LLMStepOutput> {
  const client = getOpenRouterClient();
  
  // Проверяем preconditions
  if (state.review?.status !== 'ready_to_apply' && state.review?.status !== 'collecting') {
    throw new Error(`Invalid review status for apply: ${state.review?.status}`);
  }
  
  if (!answers || answers.length === 0) {
    throw new Error('Answers are required for review apply');
  }
  
  if (!state.review?.questions || state.review.questions.length === 0) {
    throw new Error('Review questions must exist before applying answers');
  }
  
  // Загружаем промпт
  const prompt = loadPrompt('skeleton-review-apply-step.md', {
    state_json: JSON.stringify(state, null, 2),
    review_questions_json: JSON.stringify(state.review.questions, null, 2),
    review_answers_json: JSON.stringify(answers, null, 2),
  });
  
  // Вызываем LLM
  const response = await client.chatJSON<LLMStepOutput>([
    {
      role: 'system',
      content: 'Ты применяешь ответы пользователя к skeleton_draft. Твоя задача — обновить структуру skeleton на основе ответов пользователя.',
    },
    {
      role: 'user',
      content: prompt,
    },
  ]);
  
  const llmOutput = response.data;
  
  // Валидируем ответ по схеме
  const validation = validate(llmOutput, 'schema://legalagi/llm_step_output/1.0.0');
  if (!validation.valid) {
    console.warn('LLM output validation warnings:', validation.errors);
  }
  
  // Убеждаемся, что step = SKELETON_REVIEW_APPLY
  if (llmOutput.step !== 'SKELETON_REVIEW_APPLY') {
    throw new Error(`Expected step SKELETON_REVIEW_APPLY, got ${llmOutput.step}`);
  }
  
  return llmOutput;
}
