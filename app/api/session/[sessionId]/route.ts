import { NextRequest, NextResponse } from 'next/server';
import { processUserMessage, getSessionState } from '@/backend/orchestrator/session-orchestrator';
import { getSessionStorage } from '@/backend/storage/session-storage';
import { SendMessageRequest, SendMessageResponse, GetSessionResponse } from '@/lib/types';

/**
 * GET /api/session/[sessionId]
 * Получает текущее состояние сессии
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const sessionId = params.sessionId;
    
    const result = getSessionState(sessionId);
    
    if (!result) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    
    const response: GetSessionResponse = {
      state: result.state,
      next_action: result.nextAction,
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error getting session:', error);
    return NextResponse.json(
      {
        error: 'Failed to get session',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/session/[sessionId]
 * Отправляет сообщение пользователя и обрабатывает его
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const sessionId = params.sessionId;
    const body: SendMessageRequest = await request.json();
    
    // Логируем для отладки
    const storage = getSessionStorage();
    console.log(`[POST /api/session/${sessionId}] Processing message:`, body.message?.substring(0, 100));
    console.log(`[POST /api/session/${sessionId}] Available sessions:`, storage.getAllSessionIds());
    
    if (!body.message || typeof body.message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }
    
    console.log(`[POST /api/session/${sessionId}] Calling processUserMessage...`);
    const result = await processUserMessage(sessionId, body.message);
    console.log(`[POST /api/session/${sessionId}] processUserMessage completed successfully`);
    
    const response: SendMessageResponse = {
      state: result.state,
      next_action: result.nextAction,
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('[POST /api/session] Error processing message:', error);
    console.error('[POST /api/session] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('[POST /api/session] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : 'Unknown',
      sessionId: params.sessionId,
    });
    
    if (error instanceof Error && error.message.includes('Session not found')) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      {
        error: 'Failed to process message',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: process.env.NODE_ENV === 'development' 
          ? (error instanceof Error ? error.stack : String(error))
          : undefined,
      },
      { status: 500 }
    );
  }
}
