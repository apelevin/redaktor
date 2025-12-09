import { getOpenAIClient } from './client';
import { loadAndRenderPrompt } from '@/lib/utils/prompt-loader';
import { getModelConfig } from './models';
import { truncateForPrompt } from '@/lib/utils/truncate-for-prompt';
import type { Question } from '@/types/question';
import type { TokenUsage } from '@/lib/utils/cost-calculator';

const CONTEXT_CHAR_LIMIT = 6000;
const ANSWERS_ARRAY_LIMIT = 20;
const ANSWERED_IDS_LIMIT = 50;

export interface QuestionGenerationResult {
  question: Question | null;
  usage?: TokenUsage;
  model?: string;
}


/**
 * Генерирует следующий вопрос через OpenAI API
 */
export async function generateNextQuestion(
  documentType: string,
  context: Record<string, any>,
  answeredQuestionIds: string[]
): Promise<QuestionGenerationResult> {
  const client = getOpenAIClient();

  const compactContext = compactContextForPrompt(context, ANSWERS_ARRAY_LIMIT);
  const contextString = JSON.stringify(compactContext, null, 2);
  const contextForPrompt = truncateForPrompt(contextString, CONTEXT_CHAR_LIMIT);

  const limitedAnsweredIds = answeredQuestionIds.slice(-ANSWERED_IDS_LIMIT);
  const answeredIdsString = JSON.stringify(limitedAnsweredIds, null, 2);
  const answeredIdsForPrompt = truncateForPrompt(answeredIdsString, CONTEXT_CHAR_LIMIT / 2);

  const prompt = await loadAndRenderPrompt('question-generation.md', {
    documentType,
    context: contextForPrompt,
    answeredQuestionIds: answeredIdsForPrompt,
  });

  try {
    const modelConfig = getModelConfig('question_generation');
    
    const response = await client.chat.completions.create({
      model: modelConfig.model,
      messages: [
        {
          role: 'system',
          content: 'Ты - ассистент для создания юридических документов. Генерируй вопросы в формате JSON согласно инструкциям. Верни ТОЛЬКО валидный JSON без дополнительных комментариев.',
        },
        {
          role: 'user',
          content: prompt,
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
      return { 
        question: null,
        usage,
        model: modelConfig.model,
      };
    }

    // Парсим JSON из ответа
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.error('Error parsing JSON from response:', parseError);
      console.error('Response content:', content);
      return { 
        question: null,
        usage,
        model: modelConfig.model,
      };
    }

    // Если вернулся null, значит контекст достаточен
    if (parsed === null) {
      return { 
        question: null,
        usage,
        model: modelConfig.model,
      };
    }

    // Валидация структуры Question
    if (
      typeof parsed.id === 'string' &&
      typeof parsed.documentType === 'string' &&
      typeof parsed.text === 'string' &&
      ['open', 'single', 'multi'].includes(parsed.uiKind) &&
      typeof parsed.isRequired === 'boolean' &&
      Array.isArray(parsed.affects)
    ) {
      return {
        question: parsed as Question,
        usage,
        model: modelConfig.model,
      };
    }

    console.error('Invalid question structure:', parsed);
    return { 
      question: null,
      usage,
      model: modelConfig.model,
    };
  } catch (error) {
    console.error('Error generating question:', error);
    return { question: null };
  }
}

function compactContextForPrompt(value: any, arrayLimit: number): any {
  if (Array.isArray(value)) {
    return value.slice(-arrayLimit);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce<Record<string, any>>((acc, [key, val]) => {
      acc[key] = compactContextForPrompt(val, arrayLimit);
      return acc;
    }, {});
  }

  return value;
}
