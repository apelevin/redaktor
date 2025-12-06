import OpenAI from 'openai';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Question } from '@/types/question';

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
): Promise<Question | null> {
  const prompt = getPrompt(documentType, context, answeredQuestionIds);

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-5.1',
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

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return null;
    }

    // Парсим JSON из ответа
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.error('Error parsing JSON from response:', parseError);
      console.error('Response content:', content);
      return null;
    }

    // Если вернулся null, значит контекст достаточен
    if (parsed === null) {
      return null;
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
      return parsed as Question;
    }

    console.error('Invalid question structure:', parsed);
    return null;
  } catch (error) {
    console.error('Error generating question:', error);
    return null;
  }
}
