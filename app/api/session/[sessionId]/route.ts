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
    console.log(`[POST /api/session/${sessionId}] Available sessions:`, storage.getAllSessionIds());
    
    if (!body.message || typeof body.message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }
    
    const result = await processUserMessage(sessionId, body.message);
    
    const response: SendMessageResponse = {
      state: result.state,
      next_action: result.nextAction,
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error processing message:', error);
    
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
      },
      { status: 500 }
    );
  }
}
