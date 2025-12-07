import { NextRequest, NextResponse } from 'next/server';
import { generateTerms } from '@/lib/openai/terms-generator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { document_type, generated_context } = body;
    
    if (!document_type) {
      return NextResponse.json(
        { error: 'document_type is required' },
        { status: 400 }
      );
    }
    
    if (!generated_context) {
      return NextResponse.json(
        { error: 'generated_context is required' },
        { status: 400 }
      );
    }
    
    const result = await generateTerms({
      document_type,
      generated_context,
    });
    
    return NextResponse.json({ 
      terms: result.terms,
      usage: result.usage,
      model: result.model,
    });
  } catch (error) {
    console.error('Error in terms-generation route:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

