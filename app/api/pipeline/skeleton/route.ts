import { NextRequest, NextResponse } from 'next/server';
import { generateSkeleton } from '@/lib/openai/skeleton-generator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { document_type, qa_context, generated_context, jurisdiction, style, document_mode } = body;
    
    if (!document_type) {
      return NextResponse.json(
        { error: 'document_type is required' },
        { status: 400 }
      );
    }
    
    // Если есть generated_context, используем его, иначе используем qa_context
    const finalQaContext = qa_context || [];
    const finalGeneratedContext = generated_context || null;
    
    const result = await generateSkeleton({
      document_type,
      qa_context: finalGeneratedContext ? undefined : finalQaContext,
      generatedContext: finalGeneratedContext,
      jurisdiction,
      style,
      document_mode,
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

