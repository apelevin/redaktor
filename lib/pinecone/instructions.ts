import { randomUUID } from 'crypto';
import { getIndex } from './client';
import { createEmbedding } from '@/lib/openai/embeddings';
import { INSTRUCTION_THRESHOLD } from './constants';
import type { InstructionResult, Section, InstructionMetadata } from '@/types/document';
import type { Instruction, PineconeInstructionMetadata } from '@/types/instruction';

const INSTRUCTIONS_INDEX = process.env.PINECONE_INSTRUCTIONS_INDEX || 'instructions';

/**
 * Формирует текст для эмбеддинга инструкции нового формата
 * Согласно спецификации из instjsondetails.md
 */
export function buildInstructionEmbeddingText(instruction: Instruction): string {
  // Собираем заголовки всех разделов
  const sectionTitles = instruction.recommendedStructure
    .map(s => s.title)
    .join('; ');
  
  // Формируем текст согласно формату:
  // "Тип документа: {documentType}. Юрисдикция: {jurisdiction}. Когда использовать: {whenToUse}. Разделы: {section1.title}; {section2.title}; ..."
  return `Тип документа: ${instruction.documentType}.\nЮрисдикция: ${instruction.jurisdiction}.\nКогда использовать: ${instruction.whenToUse}.\nРазделы: ${sectionTitles}.`;
}

/**
 * Формирует текст для эмбеддинга инструкции согласно схеме из концепции (старый формат)
 * @deprecated Используйте buildInstructionEmbeddingText для нового формата
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
        
        // Проверяем, есть ли новый формат с fullInstruction
        if (metadata?.fullInstruction && typeof metadata.fullInstruction === 'string') {
          try {
            // Используем новую функцию для десериализации
            const mappedResult = mapPineconeMatchToInstruction(match);
            // Возвращаем в старом формате для обратной совместимости
            // Можно расширить InstructionResult в будущем, чтобы возвращать полный объект Instruction
            const instruction = mappedResult.instruction;
            return {
              instruction_found: true,
              skeleton: instruction.recommendedStructure.map(s => ({
                id: s.sectionKey,
                title: s.title,
                items: [s.description], // Преобразуем в старый формат
              })) as Section[],
              questions: instruction.requiredUserInputs,
              related_norms: [], // Можно добавить в будущем
            };
          } catch (parseError) {
            console.error('Error parsing new format instruction, falling back to old format:', parseError);
            // Продолжаем с обработкой старого формата ниже
          }
        }
        
        // Старый формат (обратная совместимость)
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
  instruction: Instruction,
  options?: {
    id?: string;
    version?: number;
  }
): Promise<{ id: string }> {
  try {
    // Валидация обязательных полей
    if (!instruction.documentType) {
      throw new Error('instruction.documentType is required');
    }
    if (!instruction.jurisdiction) {
      throw new Error('instruction.jurisdiction is required');
    }
    if (!instruction.whenToUse) {
      throw new Error('instruction.whenToUse is required');
    }
    if (!instruction.recommendedStructure || !Array.isArray(instruction.recommendedStructure)) {
      throw new Error('instruction.recommendedStructure must be an array');
    }
    
    const index = await getIndex(INSTRUCTIONS_INDEX);
    
    // Определяем id (использовать переданный или сгенерировать UUID)
    const instruction_id = options?.id || `inst_${randomUUID()}`;
    const version = options?.version ?? 1;
    
    // Формируем текст для embedding используя отдельную функцию
    const embeddingText = buildInstructionEmbeddingText(instruction);
    
    // Создаем эмбеддинг
    const vector = await createEmbedding(embeddingText);
    
    // Формируем метаданные - сериализуем сложные объекты в JSON строки
    // Pinecone не поддерживает вложенные объекты и массивы объектов в метаданных
    // Ограничение размера метаданных: ~40KB на запись
    const fullInstructionJson = JSON.stringify(instruction);
    
    // Проверяем размер метаданных (приблизительно)
    const metadataSize = Buffer.byteLength(fullInstructionJson, 'utf8');
    if (metadataSize > 35000) { // Оставляем запас на другие поля
      console.warn(`Instruction metadata size is large: ${metadataSize} bytes`);
    }
    
    // Собираем PineconeInstructionMetadata согласно спецификации
    const metadata: PineconeInstructionMetadata = {
      documentType: instruction.documentType,
      jurisdiction: instruction.jurisdiction,
      language: 'ru', // Пока фиксировано
      whenToUse: instruction.whenToUse,
      instructionQuality: instruction.instructionQuality,
      version: version,
      usage_count: 0, // На момент создания
      createdAt: new Date().toISOString(),
      fullInstruction: fullInstructionJson,
    };
    
    // Upsert в Pinecone
    await index.upsert([
      {
        id: instruction_id,
        values: vector,
        metadata: metadata as any, // Pinecone metadata type может требовать any
      },
    ]);
    
    return {
      id: instruction_id,
    };
  } catch (error) {
    console.error('Error saving instruction to Pinecone:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      if (process.env.NODE_ENV === 'development') {
        console.error('Error stack:', error.stack);
      }
    }
    throw error;
  }
}

/**
 * Преобразует результат поиска из Pinecone в объект Instruction
 * Десериализует полную инструкцию из metadata.fullInstruction
 */
export function mapPineconeMatchToInstruction(match: {
  id: string;
  score?: number;
  metadata?: Record<string, any>;
}): { id: string; score?: number; instruction: Instruction } {
  try {
    // Проверяем, что metadata.fullInstruction есть и является строкой
    if (!match.metadata?.fullInstruction || typeof match.metadata.fullInstruction !== 'string') {
      throw new Error(`Missing or invalid fullInstruction in metadata for id: ${match.id}`);
    }
    
    // Парсим полную инструкцию из JSON-строки
    const instruction: Instruction = JSON.parse(match.metadata.fullInstruction);
    
    return {
      id: match.id,
      score: match.score,
      instruction,
    };
  } catch (error) {
    console.error('Error parsing instruction from Pinecone match:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to parse instruction from Pinecone: ${error.message}`);
    }
    throw error;
  }
}

