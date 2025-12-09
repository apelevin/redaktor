import { getOpenAIClient } from './client';
import { loadAndRenderPrompt } from '@/lib/utils/prompt-loader';
import { buildChatCompletionParams, getModelConfig } from './models';
import type { TokenUsage } from '@/lib/utils/cost-calculator';

export interface ContextGenerationParams {
  document_type: string;
  context: Record<string, any>;
  qa_history: Array<{ question: string; answer: string }>;
  jurisdiction?: string;
  style?: string;
}

export interface ContextGenerationResult {
  generatedContext: string;
  usage?: TokenUsage;
  model?: string;
}

export async function generateContractContext(
  params: ContextGenerationParams
): Promise<ContextGenerationResult> {
  const client = getOpenAIClient();
  
  // Преобразуем context в текстовый формат
  const contextText = Object.keys(params.context).length > 0
    ? Object.entries(params.context)
        .map(([key, value]) => {
          if (typeof value === 'object' && value !== null) {
            return `${key}: ${JSON.stringify(value, null, 2)}`;
          }
          return `${key}: ${value}`;
        })
        .join('\n\n')
    : 'Контекст не собран.';
  
  // Форматируем историю вопросов и ответов
  const qaHistoryText = params.qa_history.length > 0
    ? params.qa_history
        .map((qa, index) => `Вопрос ${index + 1}: ${qa.question}\nОтвет: ${qa.answer}`)
        .join('\n\n')
    : 'История вопросов и ответов отсутствует.';
  
  const prompt = await loadAndRenderPrompt('context-generation.md', {
    document_type: params.document_type,
    jurisdiction: params.jurisdiction ? `Юрисдикция: ${params.jurisdiction}` : '',
    style: params.style ? `Стиль: ${params.style}` : '',
    context: contextText,
    qa_history: qaHistoryText,
  });
  
  try {
    const modelConfig = getModelConfig('context_generation');
    
    const response = await client.chat.completions.create({
      ...buildChatCompletionParams(modelConfig),
      messages: [
        {
          role: 'system',
          content: 'Ты юридический эксперт, который создает полное описание договора на основе собранного диалога. Всегда возвращай структурированный текст описания.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }
    
    // Возвращаем данные об использовании токенов для расчета стоимости на клиенте
    const usage: TokenUsage | undefined = response.usage ? {
      prompt_tokens: response.usage.prompt_tokens || 0,
      completion_tokens: response.usage.completion_tokens || 0,
      total_tokens: response.usage.total_tokens || 0,
      cached_tokens: (response.usage as any).cached_tokens || 0,
    } : undefined;
    
    return {
      generatedContext: content,
      usage,
      model: modelConfig.model,
    };
  } catch (error) {
    console.error('Error generating contract context:', error);
    throw error;
  }
}


