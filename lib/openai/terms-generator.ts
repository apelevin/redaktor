import { getOpenAIClient } from './client';
import { loadAndRenderPrompt } from '@/lib/utils/prompt-loader';
import { buildChatCompletionParams, getModelConfig } from './models';
import type { TokenUsage } from '@/lib/utils/cost-calculator';
import type { TermsDictionary } from '@/types/terms';

export interface TermsGenerationParams {
  document_type: string;
  generated_context: string;
}

export interface TermsGenerationResult {
  terms: TermsDictionary;
  usage?: TokenUsage;
  model?: string;
}

export async function generateTerms(
  params: TermsGenerationParams
): Promise<TermsGenerationResult> {
  const client = getOpenAIClient();
  
  const prompt = await loadAndRenderPrompt('terms-generation.md', {
    document_type: params.document_type,
    generated_context: params.generated_context,
  });
  
  try {
    const modelConfig = getModelConfig('terms_generation');
    
    const response = await client.chat.completions.create({
      ...buildChatCompletionParams(modelConfig),
      messages: [
        {
          role: 'system',
          content: 'Ты юридический эксперт, который анализирует описание договора и выделяет ключевые сущности для создания словаря терминов. Всегда возвращай валидный JSON с массивом терминов.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }
    
    // Парсим JSON ответ
    let parsedContent: { terms: TermsDictionary };
    try {
      parsedContent = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse terms JSON:', parseError);
      throw new Error('Invalid JSON response from OpenAI');
    }
    
    // Валидация структуры
    if (!Array.isArray(parsedContent.terms)) {
      throw new Error('Invalid terms format: expected array');
    }
    
    // Валидация каждого термина
    const validTerms = parsedContent.terms.filter((term: any) => {
      return (
        typeof term === 'object' &&
        term !== null &&
        typeof term.name === 'string' &&
        term.name.length > 0 &&
        typeof term.definition === 'string' &&
        term.definition.length > 0
      );
    });
    
    // Возвращаем данные об использовании токенов для расчета стоимости на клиенте
    const usage: TokenUsage | undefined = response.usage ? {
      prompt_tokens: response.usage.prompt_tokens || 0,
      completion_tokens: response.usage.completion_tokens || 0,
      total_tokens: response.usage.total_tokens || 0,
      cached_tokens: (response.usage as any).cached_tokens || 0,
    } : undefined;
    
    return {
      terms: validTerms,
      usage,
      model: modelConfig.model,
    };
  } catch (error) {
    console.error('Error generating terms:', error);
    throw error;
  }
}

