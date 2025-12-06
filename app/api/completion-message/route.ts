import { NextRequest, NextResponse } from 'next/server';
import { generateCompletionMessage } from '@/lib/openai/completion-message-generator';
import type { CompletionState } from '@/types/completion';
import type { Question } from '@/types/question';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { state, remainingRecommended } = body;

    if (!state) {
      return NextResponse.json(
        { error: 'state is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(remainingRecommended)) {
      return NextResponse.json(
        { error: 'remainingRecommended must be an array' },
        { status: 400 }
      );
    }

    const result = await generateCompletionMessage(
      state as CompletionState,
      remainingRecommended as Question[]
    );

    return NextResponse.json({
      message: result.message,
      usage: result.usage,
      model: result.model,
    });
  } catch (error) {
    console.error('Error in completion-message route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

