import { NextRequest, NextResponse } from 'next/server';
import { processSkeletonReviewPlan } from '@/backend/orchestrator/session-orchestrator';
import { getSessionStorage } from '@/backend/storage/session-storage';
import { SendMessageResponse } from '@/lib/types';

/**
 * POST /api/session/[sessionId]/review/plan
 * Генерирует review вопросы для skeleton
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
    if (state.meta.stage !== 'skeleton_ready' && state.meta.stage !== 'skeleton_review') {
      return NextResponse.json(
        { 
          error: 'Invalid stage for skeleton review plan',
          message: `Expected stage 'skeleton_ready' or 'skeleton_review', got '${state.meta.stage}'`,
        },
        { status: 400 }
      );
    }
    
    if (!state.document?.skeleton) {
      return NextResponse.json(
        { 
          error: 'Skeleton must exist before review planning',
          message: 'Skeleton not found in document state',
        },
        { status: 400 }
      );
    }
    
    // Генерируем review вопросы
    const result = await processSkeletonReviewPlan(sessionId);
    
    const response: SendMessageResponse = {
      state: result.state,
      next_action: result.nextAction,
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error planning skeleton review:', error);
    
    if (error instanceof Error && error.message.includes('Session not found')) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      {
        error: 'Failed to plan skeleton review',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
