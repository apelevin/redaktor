import { NextRequest, NextResponse } from 'next/server';
import { upsertClause } from '@/lib/pinecone/clauses';
import { sanitizeDocument } from '@/lib/utils/document-sanitizer';
import { isPartiesOrRequisitesSection } from '@/lib/utils/section-filter';
import type { Section } from '@/types/document';
import type { Clause } from '@/types/document';
import type { TermsDictionary } from '@/types/terms';

interface ClauseToSave {
  sectionKey: string;
  sectionTitle: string;
  text: string;
  qaContext?: Array<{ question: string; answer: string }>;
}

interface SaveClausesRequest {
  documentType: string;
  jurisdiction?: string;
  documentMode: string;
  clauses: ClauseToSave[];
  skeleton: Section[];
  terms?: TermsDictionary | null;
  instructionId?: string; // ID инструкции, к которой относятся формулировки
}

export async function POST(request: NextRequest) {
  try {
    const body: SaveClausesRequest = await request.json();
    const { documentType, jurisdiction = 'RU', documentMode, clauses, skeleton, terms, instructionId } = body;

    if (!documentType || !documentMode || !clauses || !skeleton) {
      return NextResponse.json(
        { error: 'documentType, documentMode, clauses, and skeleton are required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(clauses) || clauses.length === 0) {
      return NextResponse.json(
        { error: 'clauses must be a non-empty array' },
        { status: 400 }
      );
    }

    const savedIds: string[] = [];
    const errors: Array<{ sectionKey: string; error: string }> = [];

    // Сохраняем каждую формулировку (исключая разделы про стороны и реквизиты)
    for (const clauseData of clauses) {
      try {
        // Пропускаем разделы про стороны и реквизиты
        if (isPartiesOrRequisitesSection(clauseData.sectionTitle, clauseData.sectionKey)) {
          continue;
        }

        // Анонимизируем текст формулировки
        const sanitizedText = sanitizeDocument(clauseData.text, terms || null);

        // Анонимизируем qaContext, если он есть
        let sanitizedQaContext: Array<{ question: string; answer: string }> | undefined;
        if (clauseData.qaContext && clauseData.qaContext.length > 0) {
          sanitizedQaContext = clauseData.qaContext.map((qa) => ({
            question: sanitizeDocument(qa.question, terms || null),
            answer: sanitizeDocument(qa.answer, terms || null),
          }));
        }

        // Находим section в skeleton для получения section_path
        const section = skeleton.find((s) => s.id === clauseData.sectionKey);
        if (!section) {
          errors.push({
            sectionKey: clauseData.sectionKey,
            error: `Section not found in skeleton: ${clauseData.sectionKey}`,
          });
          continue;
        }

        // Создаем Clause объект
        const clause: Clause = {
          id: `clause_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          sectionId: clauseData.sectionKey,
          content: sanitizedText,
          source: 'llm',
        };

        // Сохраняем в Pinecone
        const result = await upsertClause({
          document_type: documentType,
          style: documentMode, // Используем documentMode как style
          clause,
          skeleton,
          instructionId, // Связываем формулировку с инструкцией
        });

        savedIds.push(result.id);
      } catch (error) {
        console.error(`Error saving clause for section ${clauseData.sectionKey}:`, error);
        errors.push({
          sectionKey: clauseData.sectionKey,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      saved: savedIds.length,
      total: clauses.length,
      ids: savedIds,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error saving clauses to Pinecone:', error);
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        ...(process.env.NODE_ENV === 'development' && error instanceof Error && {
          stack: error.stack,
        }),
      },
      { status: 500 }
    );
  }
}

