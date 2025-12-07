import { getOpenAIClient } from './client';
import { loadAndRenderPrompt } from '@/lib/utils/prompt-loader';
import { getModelConfig } from './models';
import type { TokenUsage } from '@/lib/utils/cost-calculator';
import type { Section } from '@/types/document';
import type { DocumentMode } from '@/types/document-mode';

export interface SkeletonGenerationParams {
  document_type: string;
  qa_context?: Array<{ question: string; answer: string }>;
  generatedContext?: string | null;
  jurisdiction?: string;
  style?: string;
  document_mode?: DocumentMode;
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
  
  // Если есть generatedContext, используем его, иначе используем qa_context
  const contextText = params.generatedContext 
    ? params.generatedContext
    : (params.qa_context
        ? params.qa_context.map(qa => `В: ${qa.question}\nО: ${qa.answer}`).join('\n\n')
        : 'Контекст не собран.');
  
  const prompt = await loadAndRenderPrompt('skeleton-generation.md', {
    document_type: params.document_type,
    jurisdiction: params.jurisdiction ? `Юрисдикция: ${params.jurisdiction}` : '',
    style: params.style ? `Стиль: ${params.style}` : '',
    context: contextText,
    has_generated_context: params.generatedContext ? 'true' : 'false',
    document_mode: params.document_mode || 'short',
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
    
    // Валидация нового формата: проверяем наличие sections
    if (!result.sections || !Array.isArray(result.sections)) {
      throw new Error('Invalid skeleton format: missing or invalid sections array');
    }
    
    // Валидация структуры каждой секции
    for (const section of result.sections) {
      if (!section.id || !section.title || !Array.isArray(section.items)) {
        throw new Error(`Invalid section format: ${JSON.stringify(section)}`);
      }
    }
    
    // Возвращаем данные об использовании токенов для расчета стоимости на клиенте
    const usage: TokenUsage | undefined = response.usage ? {
      prompt_tokens: response.usage.prompt_tokens || 0,
      completion_tokens: response.usage.completion_tokens || 0,
      total_tokens: response.usage.total_tokens || 0,
      cached_tokens: (response.usage as any).cached_tokens || 0,
    } : undefined;
    
    return {
      skeleton: result.sections as Section[],
      usage,
      model: modelConfig.model,
    };
  } catch (error) {
    console.error('Error generating skeleton:', error);
    throw error;
  }
}

