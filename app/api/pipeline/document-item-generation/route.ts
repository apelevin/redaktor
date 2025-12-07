import { NextRequest, NextResponse } from 'next/server';
import { generateDocumentItem } from '@/lib/openai/document-item-generator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      document_type,
      generated_context,
      section_title,
      section_id,
      item_text,
      item_index,
      item_answers,
      existing_clauses,
      jurisdiction,
      style,
      document_mode,
    } = body;

    if (!document_type || !generated_context || !section_title || !section_id || item_text === undefined || item_index === undefined) {
      return NextResponse.json(
        { error: 'document_type, generated_context, section_title, section_id, item_text, and item_index are required' },
        { status: 400 }
      );
    }

    const result = await generateDocumentItem({
      document_type,
      generated_context,
      section_title,
      section_id,
      item_text,
      item_index,
      item_answers: item_answers || null,
      existing_clauses: existing_clauses || {},
      jurisdiction,
      style,
      document_mode,
    });

    return NextResponse.json({
      generatedText: result.generatedText,
      usage: result.usage,
      model: result.model,
    });
  } catch (error) {
    console.error('Error in document-item-generation route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


