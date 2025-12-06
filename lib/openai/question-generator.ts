import OpenAI from 'openai';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Question } from '@/types/question';
import type { TokenUsage } from '@/lib/utils/cost-calculator';

export interface QuestionGenerationResult {
  question: Question | null;
  usage?: TokenUsage;
  model?: string;
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not set');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Читает промпт из файла и заменяет плейсхолдеры
 */
function getPrompt(
  documentType: string,
  context: Record<string, any>,
  answeredQuestionIds: string[]
): string {
  const promptPath = join(process.cwd(), 'prompts', 'question-generation.md');
  let prompt: string;
  
  try {
    prompt = readFileSync(promptPath, 'utf-8');
  } catch (error) {
    console.error('Error reading prompt file:', error);
    throw new Error('Failed to read prompt file');
  }

  // Заменяем плейсхолдеры
  prompt = prompt.replace('{{documentType}}', documentType);
  prompt = prompt.replace('{{context}}', JSON.stringify(context, null, 2));
  prompt = prompt.replace('{{answeredQuestionIds}}', JSON.stringify(answeredQuestionIds, null, 2));

  return prompt;
}

/**
 * Генерирует следующий вопрос через OpenAI API (GPT-5.1)
 */
export async function generateNextQuestion(
  documentType: string,
  context: Record<string, any>,
  answeredQuestionIds: string[]
): Promise<QuestionGenerationResult> {
  const prompt = getPrompt(documentType, context, answeredQuestionIds);
  const model = process.env.OPENAI_MODEL || 'gpt-5.1';

  try {
    const response = await openai.chat.completions.create({
      model,
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
      // Примечание: reasoning_effort и verbosity могут быть доступны в более новых версиях SDK
      // Для GPT-5.1 эти параметры можно добавить, когда SDK будет обновлен
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
        model,
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
        model,
      };
    }

    // Если вернулся null, значит контекст достаточен
    if (parsed === null) {
      return { 
        question: null,
        usage,
        model,
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
        model,
      };
    }

    console.error('Invalid question structure:', parsed);
    return { 
      question: null,
      usage,
      model,
    };
  } catch (error) {
    console.error('Error generating question:', error);
    return { question: null };
  }
}
