import { getOpenAIClient } from './client';
import { loadAndRenderPrompt } from '@/lib/utils/prompt-loader';
import { buildChatCompletionParams, getModelConfig } from './models';
import type { TokenUsage } from '@/lib/utils/cost-calculator';
import type { Question } from '@/types/question';
import type { DocumentMode } from '@/types/document-mode';

export interface SkeletonItemQuestionParams {
  document_type: string;
  generated_context: string;
  section_title: string;
  section_id: string;
  item_text: string;
  item_index: number;
  existing_answers: Record<string, any>;
  document_mode?: DocumentMode;
}

export interface SkeletonItemQuestionResult {
  question: Question | null;
  reason?: string;
  usage?: TokenUsage;
  model?: string;
}

export async function generateSkeletonItemQuestion(
  params: SkeletonItemQuestionParams
): Promise<SkeletonItemQuestionResult> {
  const client = getOpenAIClient();
  
  // Форматируем существующие ответы для промпта
  // Включаем не только ответы, но и вопросы, чтобы избежать дублирования
  const existingAnswersText = Object.keys(params.existing_answers).length > 0
    ? Object.entries(params.existing_answers)
        .map(([key, value]) => {
          const [sectionId, itemIndex] = key.split('-');
          const answerData = value as any;
          const questionText = answerData.questionId ? `[Вопрос: ${answerData.questionId}]` : '';
          const answerText = answerData.raw ? 
            (typeof answerData.raw === 'string' ? answerData.raw : JSON.stringify(answerData.raw)) :
            JSON.stringify(answerData);
          return `Пункт ${sectionId}-${itemIndex}:\n  ${questionText}\n  Ответ: ${answerText}`;
        })
        .join('\n\n')
    : 'Ответов пока нет.';

  const prompt = await loadAndRenderPrompt('skeleton-item-question.md', {
    document_type: params.document_type,
    generated_context: params.generated_context,
    section_title: params.section_title,
    item_text: params.item_text,
    existing_answers: existingAnswersText,
    document_mode: params.document_mode || 'short',
  });
  
  try {
    const modelConfig = getModelConfig('question_generation');
    
    const response = await client.chat.completions.create({
      ...buildChatCompletionParams(modelConfig),
      messages: [
        {
          role: 'system',
          content: 'Ты - ассистент для создания юридических документов. Определяй необходимость вопросов и генерируй их в формате JSON согласно инструкциям. Верни ТОЛЬКО валидный JSON без дополнительных комментариев.',
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
      return { question: null };
    }
    
    const parsed = JSON.parse(content);
    
    // Если вопрос не нужен
    if (parsed.question === null || parsed.question === undefined) {
      return {
        question: null,
        reason: parsed.reason || 'Вопрос не требуется',
        usage: response.usage ? {
          prompt_tokens: response.usage.prompt_tokens || 0,
          completion_tokens: response.usage.completion_tokens || 0,
          total_tokens: response.usage.total_tokens || 0,
          cached_tokens: (response.usage as any).cached_tokens || 0,
        } : undefined,
        model: modelConfig.model,
      };
    }
    
    // Валидация структуры Question
    const question = parsed.question;
    if (
      typeof question.id === 'string' &&
      typeof question.documentType === 'string' &&
      typeof question.text === 'string' &&
      ['open', 'single', 'multi'].includes(question.uiKind) &&
      typeof question.isRequired === 'boolean' &&
      Array.isArray(question.affects)
    ) {
      // Убеждаемся, что ID вопроса связан с пунктом скелета
      if (!question.id.includes(params.section_id) || !question.id.includes(String(params.item_index))) {
        question.id = `${params.document_type}.skeleton.${params.section_id}.${params.item_index}`;
      }
      
      return {
        question: question as Question,
        reason: parsed.reason,
        usage: response.usage ? {
          prompt_tokens: response.usage.prompt_tokens || 0,
          completion_tokens: response.usage.completion_tokens || 0,
          total_tokens: response.usage.total_tokens || 0,
          cached_tokens: (response.usage as any).cached_tokens || 0,
        } : undefined,
        model: modelConfig.model,
      };
    }
    
    console.error('Invalid question structure:', question);
    return { 
      question: null,
      reason: 'Неверная структура вопроса',
    };
  } catch (error) {
    console.error('Error generating skeleton item question:', error);
    return { question: null };
  }
}

