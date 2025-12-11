import { getOpenAIClient } from './client';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSION = 1024;

/**
 * Создает эмбеддинг для текста используя OpenAI API
 * @param text Текст для создания эмбеддинга
 * @returns Массив чисел (вектор эмбеддинга)
 */
export async function createEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty');
  }

  const client = getOpenAIClient();

  try {
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.trim(),
      dimensions: EMBEDDING_DIMENSION, // Явно указываем размерность для совместимости с индексами
    });

    const embedding = response.data[0]?.embedding;
    
    if (!embedding || embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(`Invalid embedding dimension: expected ${EMBEDDING_DIMENSION}, got ${embedding?.length || 0}`);
    }

    return embedding;
  } catch (error) {
    console.error('Error creating embedding:', error);
    throw error;
  }
}

/**
 * Создает эмбеддинги для массива текстов (batch)
 * @param texts Массив текстов
 * @returns Массив векторов эмбеддингов
 */
export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const client = getOpenAIClient();

  try {
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts.map(t => t.trim()),
      dimensions: EMBEDDING_DIMENSION, // Явно указываем размерность для совместимости с индексами
    });

    return response.data.map(item => item.embedding);
  } catch (error) {
    console.error('Error creating embeddings:', error);
    throw error;
  }
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSION };

