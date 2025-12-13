import { NextRequest, NextResponse } from 'next/server';
import { processSkeletonGeneration } from '@/backend/orchestrator/session-orchestrator';
import { getSessionStorage } from '@/backend/storage/session-storage';
import { SendMessageResponse } from '@/lib/types';

/**
 * POST /api/session/[sessionId]/skeleton
 * Генерирует skeleton для сессии
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const sessionId = params.sessionId;
    
    const storage = getSessionStorage();
    const state = storage.getState(sessionId);
    
    if (!state) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    
    // Проверяем preconditions
    if (state.meta.stage !== 'pre_skeleton') {
      return NextResponse.json(
        { 
          error: 'Invalid stage for skeleton generation',
          message: `Expected stage 'pre_skeleton', got '${state.meta.stage}'`,
        },
        { status: 400 }
      );
    }
    
    if (!state.gate || !state.gate.ready_for_skeleton) {
      return NextResponse.json(
        { 
          error: 'Gate check must pass before skeleton generation',
          message: 'Gate is not ready for skeleton generation',
        },
        { status: 400 }
      );
    }
    
    // Генерируем skeleton
    const result = await processSkeletonGeneration(sessionId);
    
    const response: SendMessageResponse = {
      state: result.state,
      next_action: result.nextAction,
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error generating skeleton:', error);
    
    if (error instanceof Error && error.message.includes('Session not found')) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      {
        error: 'Failed to generate skeleton',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
