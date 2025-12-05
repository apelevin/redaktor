import { getOpenAIClient } from './client';
import { loadAndRenderPrompt } from '@/lib/utils/prompt-loader';
import { getModelConfig } from './models';
import type { TokenUsage } from '@/lib/utils/cost-calculator';
import type { Section } from '@/types/document';

export interface SkeletonGenerationParams {
  document_type: string;
  qa_context: Array<{ question: string; answer: string }>;
  jurisdiction?: string;
  style?: string;
}

export interface SkeletonGenerationResult {
  skeleton: Section[];
  usage?: TokenUsage;
  model?: string;
}

export async function generateSkeleton(
  params: SkeletonGenerationParams
): Promise<SkeletonGenerationResult> {
  const client = getOpenAIClient();
  
  const qaContextText = params.qa_context
    .map(qa => `В: ${qa.question}\nО: ${qa.answer}`)
    .join('\n\n');
  
  const prompt = await loadAndRenderPrompt('skeleton-generation.md', {
    document_type: params.document_type,
    jurisdiction: params.jurisdiction ? `Юрисдикция: ${params.jurisdiction}` : '',
    style: params.style ? `Стиль: ${params.style}` : '',
    qa_context: qaContextText || 'Контекст не собран.',
  });
  
  try {
    const modelConfig = getModelConfig('skeleton_generation');
    
    const response = await client.chat.completions.create({
      model: modelConfig.model,
      messages: [
        {
          role: 'system',
          content: 'Ты юридический эксперт, который создает структуру документов. Всегда возвращай валидный JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      ...(modelConfig.reasoning_effort && modelConfig.reasoning_effort !== 'none' && { 
        reasoning_effort: modelConfig.reasoning_effort as 'low' | 'medium' | 'high' 
      }),
      ...(modelConfig.verbosity && { verbosity: modelConfig.verbosity }),
      response_format: { type: 'json_object' },
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }
    
    const result = JSON.parse(content);
    
    if (!result.skeleton || !Array.isArray(result.skeleton)) {
      throw new Error('Invalid skeleton format');
    }
    
    // Возвращаем данные об использовании токенов для расчета стоимости на клиенте
    const usage: TokenUsage | undefined = response.usage ? {
      prompt_tokens: response.usage.prompt_tokens || 0,
      completion_tokens: response.usage.completion_tokens || 0,
      total_tokens: response.usage.total_tokens || 0,
      cached_tokens: (response.usage as any).cached_tokens || 0,
    } : undefined;
    
    return {
      skeleton: result.skeleton as Section[],
      usage,
      model: modelConfig.model,
    };
  } catch (error) {
    console.error('Error generating skeleton:', error);
    throw error;
  }
}

