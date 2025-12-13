import { PreSkeletonState, LLMStepOutput } from '@/lib/types';
import { getOpenRouterClient } from '@/backend/llm/openrouter';
import { validate } from '@/backend/schemas/schema-registry';
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
