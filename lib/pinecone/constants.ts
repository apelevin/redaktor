/**
 * Константы для работы с Pinecone RAG
 */

export const INSTRUCTION_THRESHOLD = 0.75;
export const CLAUSE_THRESHOLD = 0.75;
export const TH_INSTRUCTION_STRONG = 0.8;
// Используем text-embedding-ada-002 для совместимости с индексами размерности 1024
// или можно использовать text-embedding-3-small с параметром dimensions: 1024
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSION = 1024;

