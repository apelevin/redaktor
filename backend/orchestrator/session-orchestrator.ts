import { PreSkeletonState, NextAction, LLMStepOutput } from '@/lib/types';
import { getSessionStorage } from '@/backend/storage/session-storage';
import { runInterpretStep, runGateCheckStep } from './llm-step-runner';
import { applyLLMOutput } from './patch-applier';
import { appendDialogueTurn, addAskedQuestion } from '@/lib/json-patch';
import {
  checkQuestionDeduplication,
  checkLimits,
  protectConfirmedFacts,
  detectInventedValues,
} from './policy-guard';
import { checkGate } from './gatekeeper';
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
    llmOutput = await runInterpretStep(state, userMessage);
  } catch (error) {
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
  state = applyLLMOutput(state, llmOutput);
  
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
  
  // Определяем next_action на основе статуса
  let nextAction: NextAction;
  
  if (state.meta.status === 'ready') {
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
