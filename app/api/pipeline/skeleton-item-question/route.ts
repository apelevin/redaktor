import { NextRequest, NextResponse } from 'next/server';
import { generateSkeletonItemQuestion } from '@/lib/openai/skeleton-item-question-generator';

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
      existing_answers,
      document_mode,
    } = body;

    if (!document_type || !generated_context || !section_title || !section_id || item_text === undefined || item_index === undefined) {
      return NextResponse.json(
        { error: 'document_type, generated_context, section_title, section_id, item_text, and item_index are required' },
        { status: 400 }
      );
    }

    const result = await generateSkeletonItemQuestion({
      document_type,
      generated_context,
      section_title,
      section_id,
      item_text,
      item_index,
      existing_answers: existing_answers || {},
      document_mode,
    });

    return NextResponse.json({
      question: result.question,
      reason: result.reason,
      usage: result.usage,
      model: result.model,
    });
  } catch (error) {
    console.error('Error in skeleton-item-question route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


