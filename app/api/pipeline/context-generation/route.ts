import { NextRequest, NextResponse } from 'next/server';
import { generateContractContext } from '@/lib/openai/context-generator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { document_type, context, qa_history, jurisdiction, style } = body;
    
    if (!document_type) {
      return NextResponse.json(
        { error: 'document_type is required' },
        { status: 400 }
      );
    }
    
    // Разрешаем пустой context и qa_history
    const finalContext = context || {};
    const finalQaHistory = qa_history || [];
    
    const result = await generateContractContext({
      document_type,
      context: finalContext,
      qa_history: finalQaHistory,
      jurisdiction,
      style,
    });
    
    return NextResponse.json({ 
      generatedContext: result.generatedContext,
      usage: result.usage,
      model: result.model,
    });
  } catch (error) {
    console.error('Error in context-generation route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


