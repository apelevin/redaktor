import { getOpenAIClient } from './client';
import { loadAndRenderPrompt } from '@/lib/utils/prompt-loader';
import { getModelConfig } from './models';
import type { CompletionState, CompletionMessage } from '@/types/completion';
import type { Question } from '@/types/question';
import type { TokenUsage } from '@/lib/utils/cost-calculator';

export interface CompletionMessageResult {
  message: CompletionMessage;
  usage?: TokenUsage;
  model?: string;
}

/**
 * Генерирует мета-сообщение о готовности к генерации договора
 */
export async function generateCompletionMessage(
  state: CompletionState,
  remainingRecommended: Question[]
): Promise<CompletionMessageResult> {
  const client = getOpenAIClient();
  
  const remainingQuestionsText = remainingRecommended
    .map((q, idx) => `${idx + 1}. ${q.text} (${q.id})`)
    .join('\n');
  
  const prompt = await loadAndRenderPrompt('completion-message.md', {
    mustAnswered: state.mustAnswered.toString(),
    mustTotal: state.mustTotal.toString(),
    recommendedAnswered: state.recommendedAnswered.toString(),
    recommendedTotal: state.recommendedTotal.toString(),
    overallCoverage: Math.round(state.overallCoverage * 100).toString(),
    remainingRecommended: remainingQuestionsText || 'Нет оставшихся вопросов',
  });
  
  const fullInput = `Ты - юридический ассистент. Сгенерируй мета-сообщение о готовности к генерации договора.\n\n${prompt}`;

  try {
    const modelConfig = getModelConfig('context_completion');
    
    const response = await client.chat.completions.create({
      model: modelConfig.model,
      messages: [
        {
          role: 'system',
          content: 'Ты - юридический ассистент. Генерируй мета-сообщения в формате JSON согласно инструкциям.',
        },
        {
          role: 'user',
          content: fullInput,
        },
      ],
      response_format: { type: 'json_object' },
      ...(modelConfig.reasoning_effort && modelConfig.reasoning_effort !== 'none' && { 
        reasoning_effort: modelConfig.reasoning_effort as 'low' | 'medium' | 'high' 
      }),
      ...(modelConfig.verbosity && { verbosity: modelConfig.verbosity }),
      ...(modelConfig.service_tier && { service_tier: modelConfig.service_tier }),
    });

    const usage: TokenUsage | undefined = response.usage ? {
      prompt_tokens: response.usage.prompt_tokens || 0,
      completion_tokens: response.usage.completion_tokens || 0,
      total_tokens: response.usage.total_tokens || 0,
      cached_tokens: (response.usage as any).cached_tokens || 0,
    } : undefined;

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content in response');
    }

    const parsed = JSON.parse(content);

    // Валидация структуры CompletionMessage
    if (
      typeof parsed.message === 'string' &&
      Array.isArray(parsed.summaryTopics) &&
      Array.isArray(parsed.buttons) &&
      parsed.buttons.every((b: any) => typeof b.id === 'string' && typeof b.label === 'string')
    ) {
      // Обновляем label кнопки "continue" с актуальным количеством вопросов
      const continueButton = parsed.buttons.find((b: any) => b.id === 'continue');
      if (continueButton && remainingRecommended.length > 0) {
        continueButton.label = `Продолжить уточнение (еще ${remainingRecommended.length} вопросов)`;
      }
      
      return {
        message: parsed as CompletionMessage,
        usage,
        model: modelConfig.model,
      };
    }

    throw new Error('Invalid completion message structure');
  } catch (error) {
    console.error('Error generating completion message:', error);
    // Fallback на дефолтное сообщение
    return {
      message: {
        message: 'Я собрал все ключевые данные и уже могу составить договор. Можно также уточнить дополнительные детали.',
        summaryTopics: remainingRecommended.slice(0, 3).map(q => q.text.split('?')[0].split('.')[0]),
        buttons: [
          { id: 'generate', label: 'Сформировать договор' },
          { id: 'continue', label: `Продолжить уточнение (еще ${remainingRecommended.length} вопросов)` },
        ],
      },
    };
  }
}

