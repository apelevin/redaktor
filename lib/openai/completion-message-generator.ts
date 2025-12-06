import OpenAI from 'openai';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { CompletionState, CompletionMessage } from '@/types/completion';
import type { Question } from '@/types/question';
import type { TokenUsage } from '@/lib/utils/cost-calculator';

export interface CompletionMessageResult {
  message: CompletionMessage;
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
  state: CompletionState,
  remainingRecommended: Question[]
): string {
  const promptPath = join(process.cwd(), 'prompts', 'completion-message.md');
  let prompt: string;
  
  try {
    prompt = readFileSync(promptPath, 'utf-8');
  } catch (error) {
    console.error('Error reading prompt file:', error);
    throw new Error('Failed to read prompt file');
  }

  // Заменяем плейсхолдеры
  prompt = prompt.replace('{{mustAnswered}}', state.mustAnswered.toString());
  prompt = prompt.replace('{{mustTotal}}', state.mustTotal.toString());
  prompt = prompt.replace('{{recommendedAnswered}}', state.recommendedAnswered.toString());
  prompt = prompt.replace('{{recommendedTotal}}', state.recommendedTotal.toString());
  prompt = prompt.replace('{{overallCoverage}}', Math.round(state.overallCoverage * 100).toString());
  
  const remainingQuestionsText = remainingRecommended
    .map((q, idx) => `${idx + 1}. ${q.text} (${q.id})`)
    .join('\n');
  prompt = prompt.replace('{{remainingRecommended}}', remainingQuestionsText || 'Нет оставшихся вопросов');

  return prompt;
}

/**
 * Генерирует мета-сообщение о готовности к генерации договора
 */
export async function generateCompletionMessage(
  state: CompletionState,
  remainingRecommended: Question[]
): Promise<CompletionMessageResult> {
  const prompt = getPrompt(state, remainingRecommended);
  const model = process.env.OPENAI_MODEL || 'gpt-5.1';
  
  const fullInput = `Ты - юридический ассистент. Сгенерируй мета-сообщение о готовности к генерации договора.\n\n${prompt}`;

  try {
    const response = await openai.chat.completions.create({
      model,
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
        model,
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

