import { PreSkeletonState, NextAction, LLMStepOutput, SkeletonReviewAnswer } from '@/lib/types';
import { getSessionStorage } from '@/backend/storage/session-storage';
import { runInterpretStep, runGateCheckStep, runSkeletonGenerateStep, runSkeletonReviewPlanStep, runSkeletonReviewApplyStep } from './llm-step-runner';
import { applyLLMOutput } from './patch-applier';
import { appendDialogueTurn, addAskedQuestion } from '@/lib/json-patch';
import {
  checkQuestionDeduplication,
  checkLimits,
  protectConfirmedFacts,
  detectInventedValues,
} from './policy-guard';
import { checkGate } from './gatekeeper';
import { lintSkeleton, countNodes } from './skeleton-linter';
import { validate } from '@/backend/schemas/schema-registry';
import { applyImpactOperations } from './review-impact-applier';
import { v4 as uuidv4 } from 'uuid';

/**
 * Создает новую сессию
 */
export function createSession(initialMessage?: string): PreSkeletonState {
  const sessionId = uuidv4();
  const now = new Date().toISOString();
  
  const state: PreSkeletonState = {
    meta: {
      session_id: sessionId,
      schema_id: 'schema://legalagi/pre_skeleton_state/1.0.0',
      schema_version: '1.0.0',
      stage: 'pre_skeleton',
      locale: {
        language: 'ru',
        jurisdiction: 'RU',
      },
      status: 'collecting',
      created_at: now,
      updated_at: now,
      state_version: 0,
    },
    domain: {},
    issues: [],
    dialogue: {
      history: [],
      asked: [],
    },
    control: {
      limits: {
        max_questions_per_run: 20, // Увеличено для более длинных диалогов
        max_loops: 20,
        max_history_turns: 100,
      },
      checks: {
        require_user_confirmation_for_assumptions: true,
      },
      flags: {},
    },
  };
  
  // Если есть начальное сообщение, добавляем его
  if (initialMessage) {
    return appendDialogueTurn(state, {
      role: 'user',
      text: initialMessage,
    });
  }
  
  return state;
}

/**
 * Обрабатывает сообщение пользователя
 */
export async function processUserMessage(
  sessionId: string,
  userMessage: string
): Promise<{ state: PreSkeletonState; nextAction: NextAction }> {
  const storage = getSessionStorage();
  
  // Логируем для отладки
  const allSessions = storage.getAllSessionIds();
  console.log(`[processUserMessage] Looking for session: ${sessionId}`);
  console.log(`[processUserMessage] Available sessions (${allSessions.length}):`, allSessions);
  
  let state = storage.getState(sessionId);
  
  if (!state) {
    console.error(`[processUserMessage] Session not found: ${sessionId}`);
    console.error(`[processUserMessage] Available sessions:`, allSessions);
    throw new Error(`Session not found: ${sessionId}`);
  }
  
  // Добавляем сообщение пользователя в историю
  state = appendDialogueTurn(state, {
    role: 'user',
    text: userMessage,
  });
  
  // Проверяем лимиты
  const limitsCheck = checkLimits(state);
  if (!limitsCheck.allowed) {
    return {
      state,
      nextAction: {
        kind: 'halt_error',
        error: {
          category: 'policy_violation',
          message: limitsCheck.reason || 'Limits exceeded',
        },
      },
    };
  }
  
  // Запускаем INTERPRET шаг
  let llmOutput: LLMStepOutput;
  try {
    console.log('[processUserMessage] Running INTERPRET step...');
    llmOutput = await runInterpretStep(state, userMessage);
    console.log('[processUserMessage] INTERPRET step completed, step:', llmOutput.step);
  } catch (error) {
    console.error('[processUserMessage] INTERPRET step failed:', error);
    console.error('[processUserMessage] Error stack:', error instanceof Error ? error.stack : 'No stack');
    return {
      state,
      nextAction: {
        kind: 'halt_error',
        error: {
          category: 'other',
          message: `Failed to run INTERPRET step: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      },
    };
  }
  
  // Проверяем на "придуманные" значения
  const inventedCheck = detectInventedValues(state, llmOutput);
  if (inventedCheck.detected && state.control.checks.require_user_confirmation_for_assumptions) {
    // Можно добавить логику подтверждения assumptions
    console.warn('Detected invented values:', inventedCheck.reason);
  }
  
  // Защищаем подтвержденные факты
  llmOutput.patch = protectConfirmedFacts(state, llmOutput.patch);
  
  // Применяем patch и issue_updates
  try {
    state = applyLLMOutput(state, llmOutput);
  } catch (error) {
    console.error('[processUserMessage] Failed to apply LLM output:', error);
    console.error('[processUserMessage] LLM output:', JSON.stringify(llmOutput, null, 2));
    console.error('[processUserMessage] State keys:', Object.keys(state));
    throw new Error(`Failed to apply LLM output: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Обрабатываем next_action
  if (llmOutput.next_action.kind === 'ask_user') {
    // Проверяем дедупликацию вопроса
    const dedupCheck = checkQuestionDeduplication(state, llmOutput.next_action.ask_user);
    if (!dedupCheck.allowed) {
      // Если вопрос дублируется, переходим к gate
      return processGateCheck(state);
    }
    
    // Добавляем вопрос в asked
    state = addAskedQuestion(state, {
      id: llmOutput.next_action.ask_user.question_id,
      text: llmOutput.next_action.ask_user.question_text,
    });
    
    // Сохраняем state
    storage.saveState(sessionId, state);
    
    return {
      state,
      nextAction: llmOutput.next_action,
    };
  } else if (llmOutput.next_action.kind === 'proceed_to_gate') {
    // Переходим к gate check
    return processGateCheck(state);
  } else if (llmOutput.next_action.kind === 'proceed_to_skeleton') {
    // Обновляем статус
    state.meta.status = 'ready';
    storage.saveState(sessionId, state);
    
    return {
      state,
      nextAction: llmOutput.next_action,
    };
  } else {
    // halt_error
    state.meta.status = 'blocked';
    storage.saveState(sessionId, state);
    
    return {
      state,
      nextAction: llmOutput.next_action,
    };
  }
}

/**
 * Обрабатывает gate check
 */
async function processGateCheck(
  state: PreSkeletonState
): Promise<{ state: PreSkeletonState; nextAction: NextAction }> {
  const storage = getSessionStorage();
  
  // Обновляем статус
  state.meta.status = 'gating';
  
  try {
    const gateResult = await checkGate(state);
    state = gateResult.updatedState;
    
    if (gateResult.ready) {
      // Готово к skeleton
      state.meta.status = 'ready';
      storage.saveState(state.meta.session_id, state);
      
      return {
        state,
        nextAction: {
          kind: 'proceed_to_skeleton',
        },
      };
    } else {
      // Не готово - задаем вопрос на самый критичный blocker
      state.meta.status = 'collecting';
      
      const criticalBlocker = gateResult.blockers?.find((b) => b.severity === 'critical') ||
                               gateResult.blockers?.[0];
      
      if (criticalBlocker) {
        // Генерируем вопрос на основе blocker
        const question: NextAction = {
          kind: 'ask_user',
          ask_user: {
            question_text: criticalBlocker.message,
            answer_format: 'free_text',
            why_this_question: `Этот вопрос закрывает критичный блокер: ${criticalBlocker.message}`,
            links_to_issue_ids: criticalBlocker.linked_issue_ids,
          },
        };
        
        state = addAskedQuestion(state, {
          text: criticalBlocker.message,
        });
        
        storage.saveState(state.meta.session_id, state);
        
        return {
          state,
          nextAction: question,
        };
      } else {
        // Нет конкретного blocker - возвращаем общий вопрос
        const question: NextAction = {
          kind: 'ask_user',
          ask_user: {
            question_text: gateResult.summary || 'Требуется дополнительная информация для завершения договора.',
            answer_format: 'free_text',
            why_this_question: gateResult.summary,
          },
        };
        
        storage.saveState(state.meta.session_id, state);
        
        return {
          state,
          nextAction: question,
        };
      }
    }
  } catch (error) {
    state.meta.status = 'blocked';
    storage.saveState(state.meta.session_id, state);
    
    return {
      state,
      nextAction: {
        kind: 'halt_error',
        error: {
          category: 'other',
          message: `Gate check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      },
    };
  }
}

/**
 * Получает текущее состояние сессии и next_action
 */
export function getSessionState(sessionId: string): {
  state: PreSkeletonState;
  nextAction: NextAction;
} | null {
  const storage = getSessionStorage();
  const state = storage.getState(sessionId);
  
  if (!state) {
    return null;
  }
  
  // Определяем next_action на основе статуса и stage
  let nextAction: NextAction;
  
  if (state.meta.stage === 'skeleton_final') {
    nextAction = { kind: 'proceed_to_clause_requirements' };
  } else if (state.meta.stage === 'skeleton_review' || state.meta.stage === 'skeleton_ready') {
    if (state.review?.status === 'collecting' && state.review.questions && state.review.questions.length > 0) {
      nextAction = { kind: 'show_review_questions' };
    } else {
      nextAction = { kind: 'show_review_questions' };
    }
  } else if (state.meta.status === 'ready' && state.meta.stage === 'pre_skeleton') {
    nextAction = { kind: 'proceed_to_skeleton' };
  } else if (state.meta.status === 'blocked') {
    nextAction = {
      kind: 'halt_error',
      error: {
        category: 'other',
        message: 'Session is blocked',
      },
    };
  } else if (state.gate && !state.gate.ready_for_skeleton) {
    // Есть gate, но не готов
    const blocker = state.gate.blockers?.[0];
    nextAction = {
      kind: 'ask_user',
      ask_user: {
        question_text: blocker?.message || state.gate.summary,
        answer_format: 'free_text',
      },
    };
  } else {
    // По умолчанию - продолжаем сбор информации
    nextAction = {
      kind: 'ask_user',
      ask_user: {
        question_text: 'Продолжаю сбор информации для договора...',
        answer_format: 'free_text',
      },
    };
  }
  
  return { state, nextAction };
}

/**
 * Обрабатывает генерацию skeleton
 */
export async function processSkeletonGeneration(
  sessionId: string
): Promise<{ state: PreSkeletonState; nextAction: NextAction }> {
  const storage = getSessionStorage();
  const state = storage.getState(sessionId);
  
  if (!state) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  
  // Проверяем preconditions
  if (state.meta.stage !== 'pre_skeleton') {
    throw new Error(`Invalid stage for skeleton generation: ${state.meta.stage}. Expected: pre_skeleton`);
  }
  
  if (!state.gate || !state.gate.ready_for_skeleton) {
    throw new Error('Gate check must pass before skeleton generation');
  }
  
  // Запускаем SKELETON_GENERATE шаг
  let llmOutput;
  try {
    llmOutput = await runSkeletonGenerateStep(state);
  } catch (error) {
    return {
      state,
      nextAction: {
        kind: 'halt_error',
        error: {
          category: 'other',
          message: `Failed to run SKELETON_GENERATE step: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      },
    };
  }
  
  // Применяем patch
  let updatedState = applyLLMOutput(state, llmOutput);
  
  // Проверяем, что skeleton был добавлен
  if (!updatedState.document?.skeleton) {
    return {
      state: updatedState,
      nextAction: {
        kind: 'halt_error',
        error: {
          category: 'other',
          message: 'Skeleton was not generated in LLM output',
        },
      },
    };
  }
  
  // Валидируем skeleton по схеме
  const skeletonValidation = validate(
    updatedState.document.skeleton,
    'schema://legalagi/contract_skeleton/1.0.0'
  );
  
  if (!skeletonValidation.valid) {
    // Добавляем issue о проблеме валидации
    const validationIssue: Issue = {
      id: `skeleton_validation_error_${Date.now()}`,
      severity: 'high',
      title: 'Ошибка валидации skeleton',
      why_it_matters: 'Skeleton не соответствует схеме и не может быть использован',
      resolution_hint: 'Требуется перегенерация skeleton',
      status: 'open',
    };
    
    updatedState = {
      ...updatedState,
      issues: [...updatedState.issues, validationIssue],
      meta: {
        ...updatedState.meta,
        status: 'blocked',
      },
    };
    
    storage.saveState(sessionId, updatedState);
    
    return {
      state: updatedState,
      nextAction: {
        kind: 'ask_user',
        ask_user: {
          question_text: 'Ошибка при генерации skeleton. Требуется перегенерация.',
          answer_format: 'free_text',
        },
      },
    };
  }
  
  // Запускаем линтер skeleton
  const lintResult = lintSkeleton(updatedState.document.skeleton);
  
  // Подсчитываем количество узлов
  const nodeCount = countNodes(updatedState.document.skeleton);
  
  // Обновляем skeleton_meta
  updatedState = {
    ...updatedState,
    document: {
      ...updatedState.document,
      skeleton_meta: {
        schema_version: '1.0.0',
        generated_at: new Date().toISOString(),
        generated_by_step: 'SKELETON_GENERATE',
        node_count: nodeCount,
      },
    },
  };
  
  // Если линтер нашел проблемы, добавляем их в issues
  if (!lintResult.valid && lintResult.issues.length > 0) {
    updatedState = {
      ...updatedState,
      issues: [...updatedState.issues, ...lintResult.issues],
      meta: {
        ...updatedState.meta,
        status: 'blocked',
      },
    };
    
    storage.saveState(sessionId, updatedState);
    
    return {
      state: updatedState,
      nextAction: {
        kind: 'ask_user',
        ask_user: {
          question_text: `Skeleton сгенерирован, но найдены проблемы (${lintResult.issues.length}). Проверьте issues.`,
          answer_format: 'free_text',
        },
      },
    };
  }
  
  // Всё ок - переводим stage в skeleton_ready
  updatedState = {
    ...updatedState,
    meta: {
      ...updatedState.meta,
      stage: 'skeleton_ready',
      status: 'ready',
      updated_at: new Date().toISOString(),
      state_version: (updatedState.meta.state_version || 0) + 1,
    },
  };
  
  storage.saveState(sessionId, updatedState);
  
  // После генерации skeleton переходим к review, а не сразу к clause_requirements
  return {
    state: updatedState,
    nextAction: {
      kind: 'show_review_questions',
    },
  };
}

/**
 * Обрабатывает планирование skeleton review (генерация вопросов)
 */
export async function processSkeletonReviewPlan(
  sessionId: string
): Promise<{ state: PreSkeletonState; nextAction: NextAction }> {
  const storage = getSessionStorage();
  const state = storage.getState(sessionId);
  
  if (!state) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  
  // Проверяем preconditions
  if (state.meta.stage !== 'skeleton_ready' && state.meta.stage !== 'skeleton_review') {
    throw new Error(`Invalid stage for skeleton review plan: ${state.meta.stage}. Expected: skeleton_ready or skeleton_review`);
  }
  
  if (!state.document?.skeleton) {
    throw new Error('Skeleton must exist before review planning');
  }
  
  // Генерируем review_id если отсутствует
  const reviewId = state.review?.review_id || `rev_${Date.now()}`;
  const iteration = state.review?.iteration || 0;
  
  // Запускаем SKELETON_REVIEW_PLAN шаг
  let llmOutput;
  try {
    llmOutput = await runSkeletonReviewPlanStep(state);
  } catch (error) {
    return {
      state,
      nextAction: {
        kind: 'halt_error',
        error: {
          category: 'other',
          message: `Failed to run SKELETON_REVIEW_PLAN step: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      },
    };
  }
  
  // Применяем patch
  let updatedState = applyLLMOutput(state, llmOutput);
  
  // Убеждаемся, что review блок создан
  if (!updatedState.review) {
    updatedState = {
      ...updatedState,
      review: {
        review_id: reviewId,
        iteration,
        status: 'collecting',
        questions: [],
        answers: [],
      },
    };
  }
  
  // Обновляем review метаданные
  updatedState = {
    ...updatedState,
    review: {
      ...updatedState.review,
      review_id: reviewId,
      iteration,
      status: 'collecting',
    },
    meta: {
      ...updatedState.meta,
      stage: 'skeleton_review',
      updated_at: new Date().toISOString(),
      state_version: (updatedState.meta.state_version || 0) + 1,
    },
  };
  
  // Валидируем review.questions если они есть
  if (updatedState.review.questions && updatedState.review.questions.length > 0) {
    const questionsValidation = validate(
      { review_id: reviewId, iteration, questions: updatedState.review.questions },
      'schema://legalagi/skeleton_review_questions/1.0.0'
    );
    
    if (!questionsValidation.valid) {
      console.warn('Review questions validation warnings:', questionsValidation.errors);
    }
  }
  
  storage.saveState(sessionId, updatedState);
  
  return {
    state: updatedState,
    nextAction: {
      kind: 'show_review_questions',
    },
  };
}

/**
 * Обрабатывает применение ответов skeleton review
 */
export async function processSkeletonReviewApply(
  sessionId: string,
  answers: SkeletonReviewAnswer[]
): Promise<{ state: PreSkeletonState; nextAction: NextAction }> {
  const storage = getSessionStorage();
  const state = storage.getState(sessionId);
  
  if (!state) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  
  // Проверяем preconditions
  if (state.review?.status === 'frozen') {
    throw new Error('Review is already frozen. Cannot apply more answers.');
  }
  
  if (state.review?.status && state.review.status !== 'ready_to_apply' && state.review.status !== 'collecting' && state.review.status !== 'applied') {
    throw new Error(`Invalid review status for apply: ${state.review?.status}`);
  }
  
  if (!answers || answers.length === 0) {
    throw new Error('Answers are required for review apply');
  }
  
  if (!state.review?.questions || state.review.questions.length === 0) {
    throw new Error('Review questions must exist before applying answers');
  }
  
  // Валидируем answers
  const answersValidation = validate(
    { review_id: state.review.review_id || 'unknown', answers },
    'schema://legalagi/skeleton_review_answers/1.0.0'
  );
  
  if (!answersValidation.valid) {
    console.warn('Review answers validation warnings:', answersValidation.errors);
  }
  
  // Сохраняем ответы
  let updatedState = {
    ...state,
    review: {
      ...state.review,
      answers: [...(state.review.answers || []), ...answers],
      status: 'ready_to_apply' as const,
    },
  };
  
  // Применяем impact операции из ответов
  for (const answer of answers) {
    const question = state.review.questions.find(q => q.question_id === answer.question_id);
    if (!question) continue;
    
    // Для checkbox_group и radio_group применяем impact из выбранных опций
    if (question.ux.type === 'checkbox_group' && Array.isArray(answer.value)) {
      // checkbox_group: value - массив выбранных option.value
      const selectedValues = answer.value as (string | number | boolean)[];
      for (const option of question.ux.options || []) {
        if (selectedValues.includes(option.value)) {
          updatedState = applyImpactOperations(updatedState, option.impact);
        }
      }
    } else if (question.ux.type === 'radio_group') {
      // radio_group: value - одно значение
      const selectedValue = answer.value;
      const option = question.ux.options?.find(opt => opt.value === selectedValue);
      if (option) {
        updatedState = applyImpactOperations(updatedState, option.impact);
      }
    } else if (question.ux.type === 'text_input' || question.ux.type === 'number_input') {
      // text_input/number_input: записываем в domain
      if (question.binding.bind_to_domain_path) {
        updatedState = applyImpactOperations(updatedState, [
          {
            op: 'set_domain_value',
            path: question.binding.bind_to_domain_path,
            value: answer.value,
          },
        ]);
      }
    } else if (question.ux.type === 'multi_text') {
      // multi_text: записываем каждое поле в domain
      if (question.ux.fields && typeof answer.value === 'object' && answer.value !== null) {
        const fieldValues = answer.value as Record<string, unknown>;
        for (const field of question.ux.fields) {
          if (fieldValues[field.id] !== undefined) {
            updatedState = applyImpactOperations(updatedState, [
              {
                op: 'set_domain_value',
                path: field.bind_to_domain_path,
                value: fieldValues[field.id],
              },
            ]);
          }
        }
      }
    }
  }
  
  // Запускаем SKELETON_REVIEW_APPLY шаг для финальной обработки
  let llmOutput;
  try {
    llmOutput = await runSkeletonReviewApplyStep(updatedState, answers);
    updatedState = applyLLMOutput(updatedState, llmOutput);
  } catch (error) {
    console.warn('Failed to run SKELETON_REVIEW_APPLY step, using direct impact application:', error);
    // Продолжаем с прямым применением impact
  }
  
  // Обновляем review статус
  const iteration = (updatedState.review?.iteration || 0) + 1;
  const maxIterations = 2;
  
  if (iteration >= maxIterations) {
    // Завершаем review: создаем skeleton_final и freeze
    // Используем обновленный skeleton после применения всех изменений
    const finalSkeleton = updatedState.document?.skeleton 
      ? JSON.parse(JSON.stringify(updatedState.document.skeleton))
      : undefined;
    
    if (finalSkeleton) {
      console.log('[processSkeletonReviewApply] Creating skeleton_final with', 
        finalSkeleton.root?.children?.length || 0, 'top-level children');
    }
    
    updatedState = {
      ...updatedState,
      document: {
        ...updatedState.document,
        skeleton_final: finalSkeleton,
        freeze: {
          structure: true,
        },
      },
      review: {
        ...updatedState.review,
        status: 'frozen',
        iteration,
      },
      meta: {
        ...updatedState.meta,
        stage: 'skeleton_final',
        updated_at: new Date().toISOString(),
        state_version: (updatedState.meta.state_version || 0) + 1,
      },
    };
    
    storage.saveState(sessionId, updatedState);
    
    return {
      state: updatedState,
      nextAction: {
        kind: 'proceed_to_clause_requirements',
      },
    };
  } else {
    // Продолжаем review: готовимся к следующей итерации
    updatedState = {
      ...updatedState,
      review: {
        ...updatedState.review,
        status: 'applied',
        iteration,
      },
      meta: {
        ...updatedState.meta,
        stage: 'skeleton_review', // Убеждаемся, что stage правильный
        updated_at: new Date().toISOString(),
        state_version: (updatedState.meta.state_version || 0) + 1,
      },
    };
    
    storage.saveState(sessionId, updatedState);
    
    // Запускаем следующую итерацию планирования только если stage правильный
    if (updatedState.meta.stage === 'skeleton_review') {
      return processSkeletonReviewPlan(sessionId);
    } else {
      // Если stage уже не skeleton_review, просто возвращаем текущее состояние
      return {
        state: updatedState,
        nextAction: {
          kind: 'show_review_questions',
        },
      };
    }
  }
}
