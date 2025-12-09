import { getOpenAIClient } from './client';
import { loadAndRenderPrompt } from '@/lib/utils/prompt-loader';
import { buildChatCompletionParams, getModelConfig } from './models';
import { truncateForPrompt } from '@/lib/utils/truncate-for-prompt';
import type { TokenUsage } from '@/lib/utils/cost-calculator';
import type { Section } from '@/types/document';
import type { DocumentMode } from '@/types/document-mode';
import type { TermsDictionary } from '@/types/terms';

const QA_CONTEXT_LIMIT = 4000;
const QA_CONTEXT_ITEMS_LIMIT = 25;
const TERMS_CHAR_LIMIT = 2000;

export interface SkeletonGenerationParams {
  document_type: string;
  qa_context?: Array<{ question: string; answer: string }>;
  generatedContext?: string | null;
  jurisdiction?: string;
  style?: string;
  document_mode?: DocumentMode;
  terms?: TermsDictionary | null;
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
  const limitedQaContext = params.qa_context?.slice(-QA_CONTEXT_ITEMS_LIMIT);
  const qaText = limitedQaContext
    ? limitedQaContext.map(qa => `В: ${qa.question}\nО: ${qa.answer}`).join('\n\n')
    : 'Контекст не собран.';

  const contextText = params.generatedContext ?? qaText;
  const truncatedContext = truncateForPrompt(contextText, QA_CONTEXT_LIMIT);
  const contextMarker = truncatedContext !== contextText ? '\n\n[Контекст усечён для промпта]' : '';
  const contextForPrompt = `${truncatedContext}${contextMarker}`;

  // Сериализуем terms в текстовый формат для промпта
  const termsText = params.terms && params.terms.length > 0
    ? params.terms.map(term => `"${term.name}" — ${term.definition}`).join('\n')
    : '';
  const truncatedTerms = truncateForPrompt(termsText, TERMS_CHAR_LIMIT);
  const termsMarker = truncatedTerms !== termsText ? '\n\n[Глоссарий усечён для промпта]' : '';
  const termsForPrompt = `${truncatedTerms}${termsMarker}`;
  
  const prompt = await loadAndRenderPrompt('skeleton-generation.md', {
    document_type: params.document_type,
    jurisdiction: params.jurisdiction ? `Юрисдикция: ${params.jurisdiction}` : '',
    style: params.style ? `Стиль: ${params.style}` : '',
    context: contextForPrompt,
    has_generated_context: params.generatedContext ? 'true' : 'false',
    document_mode: params.document_mode || 'short',
    terms: termsForPrompt,
  });
  
  try {
    const modelConfig = getModelConfig('skeleton_generation');
    
    const response = await client.chat.completions.create({
      ...buildChatCompletionParams(modelConfig),
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

