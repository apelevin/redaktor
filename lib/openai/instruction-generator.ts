import { getOpenAIClient } from './client';
import { loadAndRenderPrompt } from '@/lib/utils/prompt-loader';
import { buildChatCompletionParams, getModelConfig } from './models';
import type { TokenUsage } from '@/lib/utils/cost-calculator';
import type { Instruction, InstructionGenerationParams, InstructionGenerationResult } from '@/types/instruction';
import type { Section } from '@/types/document';
import type { Question } from '@/types/question';

export async function generateInstruction(
  params: InstructionGenerationParams
): Promise<InstructionGenerationResult> {
  const client = getOpenAIClient();
  
  // Сериализуем skeleton в JSON строку
  const skeletonText = JSON.stringify(params.skeleton, null, 2);
  
  // Извлекаем тексты вопросов для промпта (только текст, не весь объект)
  const questionsForPrompt = params.questions.map((q: any) => {
    if (typeof q === 'string') {
      return q;
    } else if (q && typeof q === 'object') {
      // Извлекаем текст вопроса
      return q.text || q.question || JSON.stringify(q);
    }
    return String(q);
  });
  
  // Сериализуем вопросы в JSON строку (упрощенный формат)
  const questionsText = JSON.stringify(questionsForPrompt, null, 2);
  
  const prompt = await loadAndRenderPrompt('instruction-generation.md', {
    documentType: params.documentType,
    jurisdiction: params.jurisdiction || 'RU',
    sanitizedDocument: params.sanitizedDocument,
    skeleton: skeletonText,
    questions: questionsText,
  });
  
  try {
    const modelConfig = getModelConfig('skeleton_generation'); // Используем ту же модель, что и для skeleton
    
    const response = await client.chat.completions.create({
      ...buildChatCompletionParams(modelConfig),
      messages: [
        {
          role: 'system',
          content: 'Ты — юридический ассистент уровня senior, специализирующийся на договорных конструкциях и анализе юридических документов. Всегда возвращай валидный JSON.',
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
    
    // Валидация структуры инструкции
    if (!result.documentType || !result.jurisdiction || !result.whenToUse) {
      throw new Error('Invalid instruction format: missing required fields');
    }
    
    if (!Array.isArray(result.requiredUserInputs)) {
      throw new Error('Invalid instruction format: requiredUserInputs must be an array');
    }
    
    // Нормализуем requiredUserInputs - преобразуем объекты в строки
    if (result.requiredUserInputs) {
      result.requiredUserInputs = result.requiredUserInputs.map((input: any) => {
        if (typeof input === 'string') {
          return input;
        } else if (typeof input === 'object' && input !== null) {
          // Если это объект с полем text, используем его
          if ('text' in input) {
            return input.text;
          }
          // Если это объект с полем group/questions, формируем строку
          if ('group' in input && 'questions' in input) {
            const questions = Array.isArray(input.questions) 
              ? input.questions.map((q: any) => typeof q === 'string' ? q : q.text || JSON.stringify(q)).join(', ')
              : String(input.questions);
            return `${input.group}: ${questions}`;
          }
          // Для других объектов пытаемся извлечь осмысленный текст
          if ('question' in input) {
            return input.question;
          }
          // В крайнем случае возвращаем JSON строку
          return JSON.stringify(input);
        }
        return String(input);
      });
    }
    
    if (!Array.isArray(result.recommendedStructure)) {
      throw new Error('Invalid instruction format: recommendedStructure must be an array');
    }
    
    // Валидация структуры каждой секции
    for (const section of result.recommendedStructure) {
      if (!section.sectionKey || !section.title || !section.description || typeof section.isMandatory !== 'boolean') {
        throw new Error(`Invalid section format: ${JSON.stringify(section)}`);
      }
    }
    
    // Валидация styleHints
    if (!result.styleHints || typeof result.styleHints !== 'object') {
      throw new Error('Invalid instruction format: styleHints must be an object');
    }
    
    // Возвращаем данные об использовании токенов для расчета стоимости на клиенте
    const usage: TokenUsage | undefined = response.usage ? {
      prompt_tokens: response.usage.prompt_tokens || 0,
      completion_tokens: response.usage.completion_tokens || 0,
      total_tokens: response.usage.total_tokens || 0,
      cached_tokens: (response.usage as any).cached_tokens || 0,
    } : undefined;
    
    return {
      instruction: result as Instruction,
      usage,
      model: modelConfig.model,
    };
  } catch (error) {
    console.error('Error generating instruction:', error);
    throw error;
  }
}

