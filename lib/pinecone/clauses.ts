import { randomUUID } from 'crypto';
import { getIndex } from './client';
import { createEmbedding } from '@/lib/openai/embeddings';
import { CLAUSE_THRESHOLD } from './constants';
import type { Clause, ClauseSearchResult, Section, ClauseMetadata } from '@/types/document';

const CLAUSES_INDEX = process.env.PINECONE_CLAUSES_INDEX || 'clauses';

/**
 * Формирует текст для эмбеддинга клаузы согласно схеме из концепции
 */
function formatClauseText(
  document_type: string,
  style: string | undefined,
  section_path: string,
  content: string
): string {
  const styleText = style ? `Стиль: ${style}, ` : '';
  return `Тип: ${document_type}. ${styleText}B2B, РФ.\nРаздел: ${section_path}\n\nТекст:\n${content}`;
}

/**
 * Находит полный путь раздела в skeleton по его ID
 */
function findSectionPath(sections: Section[], targetId: string, currentPath: string[] = []): string | null {
  for (const section of sections) {
    const newPath = [...currentPath, section.title];
    
    if (section.id === targetId) {
      return newPath.join('. ');
    }
    
    if (section.subsections) {
      const found = findSectionPath(section.subsections, targetId, newPath);
      if (found) return found;
    }
  }
  
  return null;
}

export interface ClauseSearchParams {
  document_type: string;
  current_section: string;
  style?: string;
  qa_context?: Array<{ question: string; answer: string }>;
  instructionId?: string; // Опционально: фильтр по ID инструкции
}

export async function searchClause(
  params: ClauseSearchParams
): Promise<ClauseSearchResult> {
  try {
    const index = await getIndex(CLAUSES_INDEX);
    
    // Формируем query для поиска согласно схеме из концепции
    const styleText = params.style ? `Стиль: ${params.style}, ` : '';
    const queryText = `Тип: ${params.document_type}. ${styleText}B2B, РФ.\nНужна клауза для раздела: "${params.current_section}".`;
    
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
    
    // Если указан instructionId, фильтруем по нему
    if (params.instructionId) {
      filter.instructionId = { $eq: params.instructionId };
    }
    
    const queryResponse = await index.query({
      vector: queryVector,
      topK: 10,
      includeMetadata: true,
      filter,
    });
    
    // Проверяем лучший результат на порог релевантности
    if (queryResponse.matches && queryResponse.matches.length > 0) {
      const match = queryResponse.matches[0];
      const score = match.score || 0;
      
      if (score >= CLAUSE_THRESHOLD) {
        const metadata = match.metadata;
        
        const clause: Clause = {
          id: match.id || `clause-${Date.now()}`,
          sectionId: params.current_section,
          content: metadata?.content as string || '',
          source: 'rag',
          metadata: {
            sourceType: metadata?.sourceType as 'template' | 'law' | 'case',
            sourceReference: metadata?.sourceReference as string,
          },
        };
        
        return {
          clause_found: true,
          clause,
          metadata: match.metadata,
        };
      }
    }
    
    return {
      clause_found: false,
    };
  } catch (error) {
    console.error('Error searching clause:', error);
    return {
      clause_found: false,
    };
  }
}

export interface UpsertClauseParams {
  document_type: string;
  style?: string;
  clause: Clause;
  skeleton: Section[];
  source_doc_id?: string;
  instructionId?: string; // ID инструкции, к которой относится формулировка
  contract_variables?: Record<string, any>;
}

/**
 * Сохраняет клаузу в Pinecone
 */
export async function upsertClause(
  params: UpsertClauseParams
): Promise<{ id: string }> {
  try {
    const index = await getIndex(CLAUSES_INDEX);
    
    // Находим полный путь раздела
    const section_path = findSectionPath(params.skeleton, params.clause.sectionId) || params.clause.sectionId;
    
    // Генерируем UUID для clause_id и source_doc_id
    const clause_id = params.clause.id || `clause_${randomUUID()}`;
    const source_doc_id = params.source_doc_id || `doc_${randomUUID()}`;
    
    // Формируем текст для эмбеддинга
    const embeddingText = formatClauseText(
      params.document_type,
      params.style,
      section_path,
      params.clause.content
    );
    
    // Создаем эмбеддинг
    const vector = await createEmbedding(embeddingText);
    
    // Формируем базовые метаданные
    const metadata: ClauseMetadata = {
      document_type: params.document_type,
      style: params.style || 'default',
      section_path,
      source_doc_id,
      instructionId: params.instructionId,
      approved: true,
      quality_score: 0.0,
    };
    
    // Добавляем опциональные переменные из contract_variables
    if (params.contract_variables) {
      // Извлекаем релевантные переменные (например, penalty_rate, penalty_cap)
      // Можно добавить логику для извлечения конкретных переменных
      Object.entries(params.contract_variables).forEach(([key, value]) => {
        if (typeof value === 'string' || typeof value === 'number') {
          metadata[key] = value;
        }
      });
    }
    
    // Сохраняем полный текст клаузы в метаданных
    const fullMetadata: any = {
      ...metadata,
      content: params.clause.content,
    };
    
    // Upsert в Pinecone
    await index.upsert([
      {
        id: clause_id,
        values: vector,
        metadata: fullMetadata,
      },
    ]);
    
    return {
      id: clause_id,
    };
  } catch (error) {
    console.error('Error upserting clause:', error);
    throw error;
  }
}

/**
 * Находит все формулировки, связанные с конкретной инструкцией
 * Используется после выбора инструкции для получения связанных формулировок
 */
export async function findClausesByInstructionId(
  instructionId: string,
  options?: {
    document_type?: string;
    style?: string;
    topK?: number;
  }
): Promise<Array<{
  id: string;
  clause: Clause;
  metadata: any;
  score?: number;
}>> {
  try {
    const index = await getIndex(CLAUSES_INDEX);
    
    // Формируем фильтр по instructionId
    const filter: any = {
      instructionId: { $eq: instructionId },
      approved: { $eq: true },
    };
    
    // Дополнительные фильтры, если указаны
    if (options?.document_type) {
      filter.document_type = { $eq: options.document_type };
    }
    
    if (options?.style) {
      filter.style = { $eq: options.style };
    }
    
    // Используем query с минимальным вектором-заглушкой для фильтрации по метаданным
    // Размерность должна соответствовать используемой модели embedding
    const EMBEDDING_DIMENSION = 1024; // text-embedding-3-small
    const queryResponse = await index.query({
      vector: new Array(EMBEDDING_DIMENSION).fill(0), // Заглушка вектора
      topK: options?.topK ?? 100,
      includeMetadata: true,
      filter,
    });
    
    const results: Array<{
      id: string;
      clause: Clause;
      metadata: any;
      score?: number;
    }> = [];
    
    if (queryResponse.matches) {
      for (const match of queryResponse.matches) {
        const metadata = match.metadata;
        const clause: Clause = {
          id: match.id || `clause-${Date.now()}`,
          sectionId: metadata?.section_path as string || '',
          content: metadata?.content as string || '',
          source: 'rag',
          metadata: {
            sourceType: metadata?.sourceType as 'template' | 'law' | 'case',
            sourceReference: metadata?.sourceReference as string,
          },
        };
        
        results.push({
          id: match.id || '',
          clause,
          metadata,
          score: match.score,
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error finding clauses by instruction ID:', error);
    return [];
  }
}

