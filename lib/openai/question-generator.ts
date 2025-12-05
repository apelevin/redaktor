import { getOpenAIClient } from './client';
import { loadAndRenderPrompt } from '@/lib/utils/prompt-loader';
import { getModelConfig } from './models';
import type { TokenUsage } from '@/lib/utils/cost-calculator';

export interface QuestionGenerationParams {
  document_type: string;
  jurisdiction?: string;
  style?: string;
  qa_context: Array<{ question: string; answer: string }>;
}

const MAX_QUESTIONS = 7; // Максимальное количество вопросов для сбора контекста

export interface QuestionGenerationResult {
  question: string | null;
  usage?: TokenUsage;
  model?: string;
}

export async function generateNextQuestion(
  params: QuestionGenerationParams
): Promise<QuestionGenerationResult> {
  // Ограничение на максимальное количество вопросов
  if (params.qa_context.length >= MAX_QUESTIONS) {
    return {
      question: null,
    };
  }
  
  const client = getOpenAIClient();
  
  // Форматируем qa_context для промпта
  const qaContextText = params.qa_context
    .map(qa => `В: ${qa.question}\nО: ${qa.answer}`)
    .join('\n\n');
  
  const prompt = await loadAndRenderPrompt('question-generation.md', {
    document_type: params.document_type,
    jurisdiction: params.jurisdiction ? `Юрисдикция: ${params.jurisdiction}` : '',
    style: params.style ? `Стиль: ${params.style}` : '',
    qa_context: qaContextText || 'Пока нет вопросов и ответов.',
  });
  
  try {
    const modelConfig = getModelConfig('question_generation');
    
    const response = await client.chat.completions.create({
      model: modelConfig.model,
      messages: [
        {
          role: 'system',
          content: 'Ты юридический ассистент, который помогает собирать контекст для создания документов.',
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
    });
    
    const question = response.choices[0]?.message?.content?.trim();
    
    // Возвращаем данные об использовании токенов для расчета стоимости на клиенте
    const usage: TokenUsage | undefined = response.usage ? {
      prompt_tokens: response.usage.prompt_tokens || 0,
      completion_tokens: response.usage.completion_tokens || 0,
      total_tokens: response.usage.total_tokens || 0,
      cached_tokens: (response.usage as any).cached_tokens || 0,
    } : undefined;
    
    // Если модель вернула пустой ответ или сигнал о завершении, возвращаем null
    const finalQuestion = (!question || question.toLowerCase().includes('вопросов больше нет')) 
      ? null 
      : question;
    
    return {
      question: finalQuestion,
      usage,
      model: modelConfig.model,
    };
  } catch (error) {
    console.error('Error generating question:', error);
    throw error;
  }
}

export interface ContextCompletionResult {
  is_complete: boolean;
  reason?: string;
  usage?: TokenUsage;
  model?: string;
}

export async function checkContextCompletion(
  params: QuestionGenerationParams
): Promise<ContextCompletionResult> {
  const client = getOpenAIClient();
  
  const qaContextText = params.qa_context
    .map(qa => `В: ${qa.question}\nО: ${qa.answer}`)
    .join('\n\n');
  
  const prompt = await loadAndRenderPrompt('context-completion.md', {
    document_type: params.document_type,
    jurisdiction: params.jurisdiction ? `Юрисдикция: ${params.jurisdiction}` : '',
    qa_context: qaContextText || 'Пока нет вопросов и ответов.',
  });
  
  try {
    const modelConfig = getModelConfig('context_completion');
    
    const response = await client.chat.completions.create({
      model: modelConfig.model,
      messages: [
        {
          role: 'system',
          content: 'Ты юридический ассистент, который определяет, достаточно ли собрано информации для создания документа. Всегда возвращай валидный JSON.',
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
      return { is_complete: false, reason: 'Не удалось получить ответ' };
    }
    
    // Возвращаем данные об использовании токенов для расчета стоимости на клиенте
    const usage: TokenUsage | undefined = response.usage ? {
      prompt_tokens: response.usage.prompt_tokens || 0,
      completion_tokens: response.usage.completion_tokens || 0,
      total_tokens: response.usage.total_tokens || 0,
      cached_tokens: (response.usage as any).cached_tokens || 0,
    } : undefined;
    
    try {
      const result = JSON.parse(content);
      return {
        is_complete: result.is_complete === true,
        reason: result.reason,
        usage,
        model: modelConfig.model,
      };
    } catch {
      return { is_complete: false, reason: 'Ошибка парсинга ответа', usage, model: modelConfig.model };
    }
  } catch (error) {
    console.error('Error checking context completion:', error);
    return { is_complete: false, reason: 'Ошибка при проверке' };
  }
}

