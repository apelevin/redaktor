import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { upsertInstruction } from '@/lib/pinecone/instructions';
import { upsertClause } from '@/lib/pinecone/clauses';
import type { DocumentState } from '@/types/document';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const state = body as DocumentState;
    
    if (!state.document_type) {
      return NextResponse.json(
        { error: 'document_type is required' },
        { status: 400 }
      );
    }
    
    if (!state.skeleton || state.skeleton.length === 0) {
      return NextResponse.json(
        { error: 'skeleton is required' },
        { status: 400 }
      );
    }
    
    if (!state.clauses || state.clauses.length === 0) {
      return NextResponse.json(
        { error: 'clauses are required' },
        { status: 400 }
      );
    }
    
    // Генерируем source_doc_id для всех записей этого документа
    const source_doc_id = `doc_${randomUUID()}`;
    
    // Сохраняем инструкцию (skeleton)
    const instructionResult = await upsertInstruction({
      document_type: state.document_type,
      style: state.style,
      skeleton: state.skeleton,
      source_doc_id,
    });
    
    // Сохраняем все клаузы
    const clauseResults = await Promise.all(
      state.clauses.map(clause =>
        upsertClause({
          document_type: state.document_type,
          style: state.style,
          clause,
          skeleton: state.skeleton,
          source_doc_id,
          contract_variables: state.contract_variables,
        })
      )
    );
    
    return NextResponse.json({
      success: true,
      instruction_id: instructionResult.skeleton_id,
      clauses_saved: clauseResults.length,
      source_doc_id,
    });
  } catch (error) {
    console.error('Error saving document:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

