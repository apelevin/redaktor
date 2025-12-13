import { NextRequest, NextResponse } from 'next/server';
import { searchInstructions } from '@/lib/pinecone/instructions';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { document_type, style } = body;
    
    if (!document_type) {
      return NextResponse.json(
        { error: 'document_type is required' },
        { status: 400 }
      );
    }
    
    const result = await searchInstructions({
      document_type,
      style,
    });
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in instruction route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

