import { NextRequest, NextResponse } from 'next/server';
import { searchClause } from '@/lib/pinecone/clauses';
import { generateClause } from '@/lib/openai/clause-generator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      document_type,
      current_section,
      qa_context,
      jurisdiction,
      style,
      related_norms,
      clauses_summary,
      contract_variables,
    } = body;
    
    if (!document_type || !current_section) {
      return NextResponse.json(
        { error: 'document_type and current_section are required' },
        { status: 400 }
      );
    }
    
    // Сначала пытаемся найти клаузу в RAG
    const searchResult = await searchClause({
      document_type,
      current_section,
      style,
      qa_context: qa_context || [],
    });
    
    if (searchResult.clause_found && searchResult.clause) {
      return NextResponse.json({
        clause: searchResult.clause,
        source: 'rag',
      });
    }
    
    // Если не найдена, генерируем через LLM
    const generated = await generateClause({
      document_type,
      current_section,
      qa_context: qa_context || [],
      jurisdiction,
      style,
      related_norms,
      clauses_summary,
      contract_variables,
    });
    
    return NextResponse.json({
      clause: generated.clause,
      source: 'llm',
      assumptions: generated.assumptions,
      related_norms: generated.related_norms,
      usage: generated.usage,
      model: generated.model,
    });
  } catch (error) {
    console.error('Error in clause route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

