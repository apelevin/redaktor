import { NextRequest, NextResponse } from 'next/server';
import { assembleDocument, formatDocumentForDisplay } from '@/lib/utils/document-assembler';
import type { DocumentState } from '@/types/document';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const state = body as DocumentState;
    
    if (!state.skeleton || state.skeleton.length === 0) {
      return NextResponse.json(
        { error: 'skeleton is required' },
        { status: 400 }
      );
    }
    
    const assembled = assembleDocument(state);
    const formatted = formatDocumentForDisplay(assembled);
    
    return NextResponse.json({
      document: assembled,
      formattedText: formatted,
    });
  } catch (error) {
    console.error('Error in assemble route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}



