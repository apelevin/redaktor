import { NextRequest, NextResponse } from 'next/server';
import { generateNextQuestion } from '@/lib/openai/question-generator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentType, context, answeredQuestionIds } = body;

    if (!documentType) {
      return NextResponse.json(
        { error: 'documentType is required' },
        { status: 400 }
      );
    }

    const result = await generateNextQuestion(
      documentType || '',
      context || {},
      answeredQuestionIds || []
    );

    return NextResponse.json({ 
      question: result.question,
      usage: result.usage,
      model: result.model,
    });
  } catch (error) {
    console.error('Error in /api/questions/next:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

