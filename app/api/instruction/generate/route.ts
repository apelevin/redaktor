import { NextRequest, NextResponse } from 'next/server';
import { sanitizeDocument } from '@/lib/utils/document-sanitizer';
import { generateInstruction } from '@/lib/openai/instruction-generator';
import { saveInstructionToPinecone } from '@/lib/pinecone/instructions';
import type { Instruction } from '@/types/instruction';
import type { Question } from '@/types/question';
import type { Section } from '@/types/document';

interface GenerateInstructionRequest {
  documentType: string;
  generatedDocument?: string | null;
  documentClauses?: Record<string, string>;
  skeleton: Section[];
  questions: Question[];
  skeletonItemAnswers?: Record<string, any>;
  terms?: any[] | null;
  generatedContext?: string | null;
  jurisdiction?: string;
}

/**
 * Собирает полный текст документа из documentClauses
 */
function assembleDocumentFromClauses(
  documentClauses: Record<string, string>,
  skeleton: Section[]
): string {
  const sections: string[] = [];
  
  skeleton.forEach((section) => {
    const sectionTexts: string[] = [];
    let hasItems = false;
    
    section.items.forEach((item, index) => {
      const itemKey = `${section.id}-${index}`;
      if (documentClauses[itemKey]) {
        sectionTexts.push(documentClauses[itemKey]);
        hasItems = true;
      }
    });
    
    if (hasItems) {
      sections.push(`## ${section.title}\n`);
      sections.push(...sectionTexts);
    }
  });
  
  return sections.join('\n\n');
}

/**
 * Собирает все вопросы из разных источников
 */
function collectAllQuestions(
  questions: Question[],
  skeletonItemAnswers?: Record<string, any>
): Question[] {
  const allQuestions = [...questions];
  
  // Добавляем вопросы из skeletonItemAnswers, если они есть
  // skeletonItemAnswers содержит ответы, но мы можем создать вопросы на их основе
  if (skeletonItemAnswers) {
    // Здесь можно добавить логику для извлечения вопросов из skeletonItemAnswers
    // Пока просто используем переданные questions
  }
  
  return allQuestions;
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateInstructionRequest = await request.json();
    const {
      documentType,
      generatedDocument,
      documentClauses,
      skeleton,
      questions,
      skeletonItemAnswers,
      terms,
      generatedContext,
      jurisdiction = 'RU',
    } = body;
    
    if (!documentType) {
      return NextResponse.json(
        { error: 'documentType is required' },
        { status: 400 }
      );
    }
    
    if (!skeleton || skeleton.length === 0) {
      return NextResponse.json(
        { error: 'skeleton is required' },
        { status: 400 }
      );
    }
    
    // Собираем полный текст документа
    let fullDocument = generatedDocument || '';
    
    if (!fullDocument && documentClauses) {
      fullDocument = assembleDocumentFromClauses(documentClauses, skeleton);
    }
    
    if (!fullDocument || fullDocument.trim().length === 0) {
      return NextResponse.json(
        { error: 'Document text is required (generatedDocument or documentClauses)' },
        { status: 400 }
      );
    }
    
    // Шаг 1: Анонимизация документа
    const sanitizedDocument = sanitizeDocument(fullDocument, terms || null);
    
    // Шаг 2: Сбор всех вопросов
    const allQuestions = collectAllQuestions(questions, skeletonItemAnswers);
    
    // Шаг 3: Генерация инструкции через LLM
    const generationResult = await generateInstruction({
      sanitizedDocument,
      skeleton,
      questions: allQuestions,
      documentType,
      jurisdiction,
    });
    
    // Шаг 4: Сохранение в Pinecone
    let pineconeId: string | null = null;
    try {
      const saveResult = await saveInstructionToPinecone(generationResult.instruction);
      pineconeId = saveResult.id;
    } catch (pineconeError) {
      // Логируем ошибку, но не прерываем процесс - инструкция уже сгенерирована
      console.error('Error saving instruction to Pinecone:', pineconeError);
    }
    
    // Шаг 5: Возврат инструкции клиенту
    return NextResponse.json({
      instruction: generationResult.instruction,
      pineconeId,
      usage: generationResult.usage,
      model: generationResult.model,
    });
  } catch (error) {
    console.error('Error in instruction generation:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

