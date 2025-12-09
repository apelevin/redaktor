import { createHash } from 'crypto';
import { getOpenAIClient } from './client';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSION = 1024;
const EMBEDDING_BATCH_LIMIT = 2048;
const EMBEDDING_CACHE_LIMIT = 500;

const embeddingCache = new Map<string, number[]>();
let cacheHitCount = 0;
let cacheMissCount = 0;

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function getFromCache(hash: string): number[] | undefined {
  const cached = embeddingCache.get(hash);
  if (cached) {
    // Поддерживаем LRU семантику
    embeddingCache.delete(hash);
    embeddingCache.set(hash, cached);
  }
  return cached;
}

function setCache(hash: string, embedding: number[]): void {
  if (embeddingCache.size >= EMBEDDING_CACHE_LIMIT) {
    const firstKey = embeddingCache.keys().next().value;
    if (firstKey) {
      embeddingCache.delete(firstKey);
    }
  }
  embeddingCache.set(hash, embedding);
}

function logCacheHit(hash: string): void {
  cacheHitCount += 1;
  console.info(
    `[Embeddings] cache hit #${cacheHitCount} (hash: ${hash.slice(0, 8)}, misses: ${cacheMissCount})`
  );
}

function logCacheMiss(): void {
  cacheMissCount += 1;
}

/**
 * Создает эмбеддинг для текста используя OpenAI API
 * @param text Текст для создания эмбеддинга
 * @returns Массив чисел (вектор эмбеддинга)
 */
export async function createEmbedding(text: string, options?: { useCache?: boolean }): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty');
  }

  const normalizedText = text.trim();
  const hash = hashText(normalizedText);
  const useCache = options?.useCache !== false;

  if (useCache) {
    const cached = getFromCache(hash);
    if (cached) {
      logCacheHit(hash);
      return cached;
    }
    logCacheMiss();
  }

  const client = getOpenAIClient();

  try {
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: normalizedText,
      dimensions: EMBEDDING_DIMENSION, // Явно указываем размерность для совместимости с индексами
    });

    const embedding = response.data[0]?.embedding;
    
    if (!embedding || embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(`Invalid embedding dimension: expected ${EMBEDDING_DIMENSION}, got ${embedding?.length || 0}`);
    }

    if (useCache) {
      setCache(hash, embedding);
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
 * @param options Опции вызова
 * @returns Массив векторов эмбеддингов
 */
export async function createEmbeddings(
  texts: string[],
  options?: { batchSize?: number; useCache?: boolean }
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const useCache = options?.useCache !== false;
  const batchSize = options?.batchSize ?? EMBEDDING_BATCH_LIMIT;
  const client = getOpenAIClient();

  const normalizedTexts = texts.map(t => t.trim());
  normalizedTexts.forEach((text, index) => {
    if (!text) {
      throw new Error(`Text at index ${index} cannot be empty`);
    }
  });
  const results: Array<number[] | undefined> = new Array(normalizedTexts.length);
  const pending: Array<{ index: number; text: string; hash: string }> = [];

  normalizedTexts.forEach((text, index) => {
    const hash = hashText(text);
    if (useCache) {
      const cached = getFromCache(hash);
      if (cached) {
        logCacheHit(hash);
        results[index] = cached;
        return;
      }
      logCacheMiss();
    }

    pending.push({ index, text, hash });
  });

  try {
    for (let i = 0; i < pending.length; i += batchSize) {
      const batch = pending.slice(i, i + batchSize);
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch.map(item => item.text),
        dimensions: EMBEDDING_DIMENSION, // Явно указываем размерность для совместимости с индексами
      });

      if (!response.data || response.data.length !== batch.length) {
        throw new Error(
          `Invalid embeddings response size: expected ${batch.length}, got ${response.data?.length || 0}`
        );
      }

      response.data.forEach((item, idx) => {
        const embedding = item.embedding;
        if (!embedding || embedding.length !== EMBEDDING_DIMENSION) {
          throw new Error(
            `Invalid embedding dimension: expected ${EMBEDDING_DIMENSION}, got ${embedding?.length || 0}`
          );
        }

        const target = batch[idx];
        results[target.index] = embedding;

        if (useCache) {
          setCache(target.hash, embedding);
        }
      });
    }

    return results.map((embedding, index) => {
      if (!embedding) {
        throw new Error(`Missing embedding for text index ${index}`);
      }
      return embedding;
    });
  } catch (error) {
    console.error('Error creating embeddings:', error);
    throw error;
  }
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSION };

