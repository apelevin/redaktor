import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/backend/orchestrator/session-orchestrator';
import { getSessionStorage } from '@/backend/storage/session-storage';
import { CreateSessionRequest, CreateSessionResponse } from '@/lib/types';
import { validate } from '@/backend/schemas/schema-registry';

/**
 * POST /api/session
 * Создает новую сессию
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateSessionRequest = await request.json();
    
    // Создаем новую сессию
    const state = createSession(body.initial_message);
    
    // Сохраняем в storage
    const storage = getSessionStorage();
    storage.saveState(state.meta.session_id, state);
    
    // Логируем для отладки
    console.log(`[Session Created] ID: ${state.meta.session_id}, Total sessions: ${storage.getAllSessionIds().length}`);
    
    // Определяем начальный next_action
    const nextAction = body.initial_message
      ? {
          kind: 'ask_user' as const,
          ask_user: {
            question_text: 'Опишите задачу: какой договор, какая сделка, что важно.',
            answer_format: 'free_text' as const,
          },
        }
      : {
          kind: 'ask_user' as const,
          ask_user: {
            question_text: 'Опишите задачу: какой договор, какая сделка, что важно.',
            answer_format: 'free_text' as const,
          },
        };
    
    // Валидируем state перед отправкой (опционально, можно отключить для отладки)
    try {
      const validation = validate(state, 'schema://legalagi/pre_skeleton_state/1.0.0');
      if (!validation.valid) {
        console.warn('State validation warnings:', validation.errors);
        // Продолжаем, но логируем предупреждения
      }
    } catch (validationError) {
      console.warn('Schema validation error (continuing anyway):', validationError);
      // Продолжаем выполнение даже при ошибке валидации
    }
    
    const response: CreateSessionResponse = {
      session_id: state.meta.session_id,
      state,
      next_action: nextAction,
    };
    
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Error creating session:', error);
    return NextResponse.json(
      {
        error: 'Failed to create session',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
