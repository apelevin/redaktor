import { NextRequest, NextResponse } from 'next/server';
import {
  generateNextQuestion,
  checkContextCompletion,
} from '@/lib/openai/question-generator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      document_type,
      jurisdiction,
      style,
      qa_context,
      action, // 'generate_question' | 'check_completion'
    } = body;
    
    if (!document_type) {
      return NextResponse.json(
        { error: 'document_type is required' },
        { status: 400 }
      );
    }
    
    const params = {
      document_type,
      jurisdiction,
      style,
      qa_context: qa_context || [],
    };
    
    if (action === 'check_completion') {
      const result = await checkContextCompletion(params);
      return NextResponse.json(result);
    } else {
      // generate_question (default)
      const result = await generateNextQuestion(params);
      
      if (!result.question) {
        // Проверяем, завершен ли контекст
        const completion = await checkContextCompletion(params);
        return NextResponse.json({
          question: null,
          is_complete: completion.is_complete,
          reason: completion.reason,
          usage: result.usage,
          model: result.model,
          completion_usage: completion.usage,
          completion_model: completion.model,
        });
      }
      
      return NextResponse.json({
        question: result.question,
        is_complete: false,
        usage: result.usage,
        model: result.model,
      });
    }
  } catch (error) {
    console.error('Error in context route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

