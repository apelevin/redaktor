import { randomUUID } from 'crypto';
import { getIndex } from './client';
import { createEmbedding } from '@/lib/openai/embeddings';
import { INSTRUCTION_THRESHOLD } from './constants';
import type { InstructionResult, Section, InstructionMetadata } from '@/types/document';

const INSTRUCTIONS_INDEX = process.env.PINECONE_INSTRUCTIONS_INDEX || 'instructions';

/**
 * Формирует текст для эмбеддинга инструкции согласно схеме из концепции
 */
function formatInstructionText(
  document_type: string,
  style: string | undefined,
  skeleton: Section[],
  context?: string
): string {
  const styleText = style ? `Стиль: ${style}, ` : '';
  
  // Формируем оглавление из skeleton
  const formatSection = (section: Section, level: number = 0): string => {
    const indent = '  '.repeat(level);
    let result = `${indent}${section.title}\n`;
    if (section.subsections) {
      for (const subsection of section.subsections) {
        result += formatSection(subsection, level + 1);
      }
    }
    return result;
  };
  
  const skeletonText = skeleton.map(s => formatSection(s)).join('');
  
  let text = `Тип: ${document_type}. ${styleText}B2B, РФ.\nОглавление:\n${skeletonText}`;
  
  if (context) {
    text += `\n\nКраткий контекст: ${context}`;
  }
  
  return text;
}

export interface InstructionSearchParams {
  document_type: string;
  style?: string;
}

export async function searchInstructions(
  params: InstructionSearchParams
): Promise<InstructionResult> {
  try {
    const index = await getIndex(INSTRUCTIONS_INDEX);
    
    // Формируем query для поиска согласно схеме из концепции
    const styleText = params.style ? `Стиль: ${params.style}, ` : '';
    const queryText = `Тип: ${params.document_type}. ${styleText}B2B, РФ.\nНужно типовое оглавление и структуру договора.`;
    
    // Создаем эмбеддинг для запроса
    const queryVector = await createEmbedding(queryText);
    
    // Формируем фильтр
    const filter: any = {
      document_type: { $eq: params.document_type },
      approved: { $eq: true },
    };
    
    if (params.style) {
      filter.style = { $eq: params.style };
    }
    
    const queryResponse = await index.query({
      vector: queryVector,
      topK: 5,
      includeMetadata: true,
      filter,
    });
    
    // Проверяем лучший результат на порог релевантности
    if (queryResponse.matches && queryResponse.matches.length > 0) {
      const match = queryResponse.matches[0];
      const score = match.score || 0;
      
      if (score >= INSTRUCTION_THRESHOLD) {
        const metadata = match.metadata;
        
        return {
          instruction_found: true,
          skeleton: metadata?.skeleton as Section[],
          questions: metadata?.questions as string[],
          related_norms: metadata?.related_norms as string[],
        };
      }
    }
    
    return {
      instruction_found: false,
    };
  } catch (error) {
    console.error('Error searching instructions:', error);
    return {
      instruction_found: false,
    };
  }
}

export interface UpsertInstructionParams {
  document_type: string;
  style?: string;
  skeleton: Section[];
  source_doc_id?: string;
  context?: string;
}

/**
 * Сохраняет skeleton как инструкцию в Pinecone
 */
export async function upsertInstruction(
  params: UpsertInstructionParams
): Promise<{ id: string; skeleton_id: string }> {
  try {
    const index = await getIndex(INSTRUCTIONS_INDEX);
    
    // Генерируем UUID для skeleton_id и source_doc_id
    const skeleton_id = `skl_${randomUUID()}`;
    const source_doc_id = params.source_doc_id || `doc_${randomUUID()}`;
    
    // Формируем текст для эмбеддинга
    const embeddingText = formatInstructionText(
      params.document_type,
      params.style,
      params.skeleton,
      params.context
    );
    
    // Создаем эмбеддинг
    const vector = await createEmbedding(embeddingText);
    
    // Формируем метаданные
    const metadata: InstructionMetadata = {
      document_type: params.document_type,
      style: params.style || 'default',
      skeleton_id,
      source_doc_id,
      approved: true,
      version: 1,
      usage_count: 0,
    };
    
    // Сохраняем skeleton в метаданных (для быстрого доступа без дополнительного запроса)
    const fullMetadata: any = {
      ...metadata,
      skeleton: params.skeleton,
    };
    
    // Upsert в Pinecone
    await index.upsert([
      {
        id: skeleton_id,
        values: vector,
        metadata: fullMetadata,
      },
    ]);
    
    return {
      id: skeleton_id,
      skeleton_id,
    };
  } catch (error) {
    console.error('Error upserting instruction:', error);
    throw error;
  }
}

/**
 * Сохраняет инструкцию нового формата в Pinecone
 * Формат инструкции согласно v2 self learning approach
 */
export async function saveInstructionToPinecone(
  instruction: Instruction
): Promise<{ id: string }> {
  try {
    const index = await getIndex(INSTRUCTIONS_INDEX);
    
    // Генерируем UUID для id (формат: inst_...)
    const instruction_id = `inst_${randomUUID()}`;
    
    // Формируем текст для embedding согласно спецификации:
    // "{documentType}. {jurisdiction}. {whenToUse}. {structureTitles}"
    const structureTitles = instruction.recommendedStructure
      .map(s => s.title)
      .join(', ');
    
    const embeddingText = `${instruction.documentType}. ${instruction.jurisdiction}. ${instruction.whenToUse}. ${structureTitles}`;
    
    // Создаем эмбеддинг
    const vector = await createEmbedding(embeddingText);
    
    // Формируем метаданные - сохраняем полный JSON инструкции
    const metadata: any = {
      documentType: instruction.documentType,
      jurisdiction: instruction.jurisdiction,
      whenToUse: instruction.whenToUse,
      requiredUserInputs: instruction.requiredUserInputs,
      recommendedStructure: instruction.recommendedStructure,
      styleHints: instruction.styleHints,
      placeholdersUsed: instruction.placeholdersUsed,
      instructionQuality: instruction.instructionQuality,
      createdAt: new Date().toISOString(),
      isSavedToKnowledgeBase: true,
      approved: true, // Новые инструкции по умолчанию approved
      version: 1,
      usage_count: 0,
    };
    
    // Upsert в Pinecone
    await index.upsert([
      {
        id: instruction_id,
        values: vector,
        metadata,
      },
    ]);
    
    return {
      id: instruction_id,
    };
  } catch (error) {
    console.error('Error saving instruction to Pinecone:', error);
    throw error;
  }
}

