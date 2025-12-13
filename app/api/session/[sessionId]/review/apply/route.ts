import { NextRequest, NextResponse } from 'next/server';
import { processSkeletonReviewApply } from '@/backend/orchestrator/session-orchestrator';
import { getSessionStorage } from '@/backend/storage/session-storage';
import { SendMessageResponse, SkeletonReviewAnswer } from '@/lib/types';

/**
 * POST /api/session/[sessionId]/review/apply
 * Применяет ответы пользователя к skeleton review
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const sessionId = params.sessionId;
    const body = await request.json();
    
    const storage = getSessionStorage();
    const state = storage.getState(sessionId);
    
    if (!state) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    
    // Валидируем body
    if (!body.answers || !Array.isArray(body.answers)) {
      return NextResponse.json(
        { error: 'Answers are required and must be an array' },
        { status: 400 }
      );
    }
    
    const answers: SkeletonReviewAnswer[] = body.answers.map((ans: any) => ({
      question_id: ans.question_id,
      value: ans.value,
      at: ans.at || new Date().toISOString(),
    }));
    
    // Логируем для отладки
    console.log(`[POST /api/session/${sessionId}/review/apply] Review status:`, state.review?.status);
    console.log(`[POST /api/session/${sessionId}/review/apply] Review questions count:`, state.review?.questions?.length || 0);
    console.log(`[POST /api/session/${sessionId}/review/apply] Answers count:`, answers.length);
    console.log(`[POST /api/session/${sessionId}/review/apply] Stage:`, state.meta.stage);
    
    // Проверяем preconditions
    if (state.review?.status === 'frozen') {
      console.log(`[POST /api/session/${sessionId}/review/apply] Review is frozen, rejecting`);
      return NextResponse.json(
        { 
          error: 'Review is already frozen',
          message: 'Review has been completed and structure is frozen. Cannot apply more answers.',
        },
        { status: 400 }
      );
    }
    
    if (!state.review) {
      console.log(`[POST /api/session/${sessionId}/review/apply] No review block found`);
      return NextResponse.json(
        { 
          error: 'Review not initialized',
          message: 'Review block does not exist. Please start review first.',
        },
        { status: 400 }
      );
    }
    
    if (state.review.status && state.review.status !== 'ready_to_apply' && state.review.status !== 'collecting' && state.review.status !== 'applied') {
      console.log(`[POST /api/session/${sessionId}/review/apply] Invalid status:`, state.review.status);
      return NextResponse.json(
        { 
          error: 'Invalid review status for apply',
          message: `Expected status 'ready_to_apply', 'collecting', or 'applied', got '${state.review.status}'`,
        },
        { status: 400 }
      );
    }
    
    if (!state.review.questions || state.review.questions.length === 0) {
      console.log(`[POST /api/session/${sessionId}/review/apply] No questions found`);
      return NextResponse.json(
        { 
          error: 'Review questions must exist before applying answers',
          message: 'No review questions found',
        },
        { status: 400 }
      );
    }
    
    // Применяем ответы
    const result = await processSkeletonReviewApply(sessionId, answers);
    
    const response: SendMessageResponse = {
      state: result.state,
      next_action: result.nextAction,
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error applying skeleton review:', error);
    
    if (error instanceof Error && error.message.includes('Session not found')) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      {
        error: 'Failed to apply skeleton review',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
