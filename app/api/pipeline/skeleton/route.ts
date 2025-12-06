import { NextRequest, NextResponse } from 'next/server';
import { generateSkeleton } from '@/lib/openai/skeleton-generator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { document_type, qa_context, jurisdiction, style } = body;
    
    if (!document_type) {
      return NextResponse.json(
        { error: 'document_type is required' },
        { status: 400 }
      );
    }
    
    // Разрешаем пустой qa_context - skeleton можно сгенерировать и без контекста
    // если есть только document_type
    const finalQaContext = qa_context || [];
    
    const result = await generateSkeleton({
      document_type,
      qa_context: finalQaContext,
      jurisdiction,
      style,
    });
    
    return NextResponse.json({ 
      skeleton: result.skeleton,
      usage: result.usage,
      model: result.model,
    });
  } catch (error) {
    console.error('Error in skeleton route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

