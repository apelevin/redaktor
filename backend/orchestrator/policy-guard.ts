import { PreSkeletonState, AskUserAction, LLMStepOutput, NextAction, JsonPatchOp } from '@/lib/types';

/**
 * Проверяет дедупликацию вопросов
 */
export function checkQuestionDeduplication(
  state: PreSkeletonState,
  question: AskUserAction
): { allowed: boolean; reason?: string } {
  // Проверяем по semantic_fingerprint, если есть
  if (question.question_id) {
    const alreadyAsked = state.dialogue.asked.some(
      (q) => q.id === question.question_id || q.semantic_fingerprint === question.question_id
    );
    if (alreadyAsked) {
      return {
        allowed: false,
        reason: `Question with id ${question.question_id} was already asked`,
      };
    }
  }
  
  // Проверяем по тексту (простое сравнение)
  const similarQuestion = state.dialogue.asked.find(
    (q) => q.text.toLowerCase().trim() === question.question_text.toLowerCase().trim()
  );
  if (similarQuestion) {
    return {
      allowed: false,
      reason: `Similar question was already asked: ${similarQuestion.text}`,
    };
  }
  
  return { allowed: true };
}

/**
 * Проверяет лимиты
 */
export function checkLimits(state: PreSkeletonState): { allowed: boolean; reason?: string } {
  const { limits } = state.control;
  
  // Проверяем max_questions_per_run (считаем вопросы в текущем "run")
  // Для простоты считаем все вопросы в asked за последние 5 минут как один "run"
  // Это более разумный интервал для интерактивного диалога
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  const recentQuestions = state.dialogue.asked.filter(
    (q) => new Date(q.at).getTime() > fiveMinutesAgo
  );
  
  // Логируем для отладки
  console.log(`[checkLimits] Recent questions (last 5 min): ${recentQuestions.length}, limit: ${limits.max_questions_per_run}`);
  
  if (recentQuestions.length >= limits.max_questions_per_run) {
    return {
      allowed: false,
      reason: `Max questions per run exceeded: ${recentQuestions.length} >= ${limits.max_questions_per_run}. Please wait a moment or increase the limit.`,
    };
  }
  
  // Проверяем max_history_turns
  if (state.dialogue.history.length >= limits.max_history_turns) {
    return {
      allowed: false,
      reason: `Max history turns exceeded: ${state.dialogue.history.length} >= ${limits.max_history_turns}`,
    };
  }
  
  return { allowed: true };
}

/**
 * Защищает подтвержденные факты от изменения
 * (базовая реализация - можно расширить)
 */
export function protectConfirmedFacts(
  state: PreSkeletonState,
  patch: LLMStepOutput['patch']
): LLMStepOutput['patch'] {
  // Если в domain есть facts.confirmed, защищаем их от удаления/замены
  const confirmedFactsPath = '/domain/facts/confirmed';
  
  if (patch.format === 'json_patch') {
    const ops = patch.ops as JsonPatchOp[];
    
    // Фильтруем операции, которые пытаются изменить confirmed facts
    const protectedOps = ops.filter((op) => {
      if (op.path.startsWith(confirmedFactsPath) && (op.op === 'remove' || op.op === 'replace')) {
        return false; // Блокируем
      }
      return true;
    });
    
    return {
      ...patch,
      ops: protectedOps,
    };
  }
  
  // Для merge_patch просто возвращаем как есть (защита на уровне применения)
  return patch;
}

/**
 * Обнаруживает попытки "придумать" значения
 * (базовая реализация - можно улучшить через LLM)
 */
export function detectInventedValues(
  state: PreSkeletonState,
  llmOutput: LLMStepOutput
): { detected: boolean; reason?: string } {
  // Проверяем safety флаги
  if (llmOutput.safety?.has_unconfirmed_assumptions) {
    return {
      detected: true,
      reason: 'LLM output contains unconfirmed assumptions',
    };
  }
  
  // Можно добавить более сложную логику проверки patch на "придуманные" значения
  // Например, проверка на значения типа "не указано", "по умолчанию" и т.д.
  
  return { detected: false };
}
