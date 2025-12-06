import { getOpenAIClient } from './client';
import { loadAndRenderPrompt } from '@/lib/utils/prompt-loader';
import { getModelConfig } from './models';
import type { TokenUsage } from '@/lib/utils/cost-calculator';

export interface DocumentItemGenerationParams {
  document_type: string;
  generated_context: string;
  section_title: string;
  section_id: string;
  item_text: string;
  item_index: number;
  item_answers: any; // Ответы пользователя по этому пункту
  existing_clauses: Record<string, string>; // Уже сгенерированные тексты
  jurisdiction?: string;
  style?: string;
}

export interface DocumentItemGenerationResult {
  generatedText: string;
  usage?: TokenUsage;
  model?: string;
}

export async function generateDocumentItem(
  params: DocumentItemGenerationParams
): Promise<DocumentItemGenerationResult> {
  const client = getOpenAIClient();
  
  // Форматируем ответы пользователя
  const itemAnswersText = params.item_answers
    ? (typeof params.item_answers === 'string' 
        ? params.item_answers 
        : JSON.stringify(params.item_answers, null, 2))
    : 'Ответы пользователя не предоставлены.';

  // Форматируем уже сгенерированные тексты
  const existingClausesText = Object.keys(params.existing_clauses).length > 0
    ? Object.entries(params.existing_clauses)
        .map(([key, text]) => {
          const [sectionId, itemIndex] = key.split('-');
          return `Пункт ${sectionId}-${itemIndex}:\n${text}`;
        })
        .join('\n\n')
    : 'Пока нет сгенерированных текстов.';

  const prompt = await loadAndRenderPrompt('document-item-generation.md', {
    document_type: params.document_type,
    jurisdiction: params.jurisdiction ? `Юрисдикция: ${params.jurisdiction}` : '',
    style: params.style ? `Стиль: ${params.style}` : '',
    generated_context: params.generated_context,
    section_title: params.section_title,
    item_text: params.item_text,
    item_answers: itemAnswersText,
    existing_clauses: existingClausesText,
  });
  
  try {
    const modelConfig = getModelConfig('clause_generation');
    
    const response = await client.chat.completions.create({
      model: modelConfig.model,
      messages: [
        {
          role: 'system',
          content: 'Ты юридический эксперт, который создает полный текст юридического документа. Возвращай только текст пункта документа, без дополнительных пояснений, метаданных или форматирования JSON.',
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
      response_format: { type: 'text' },
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }
    
    const usage: TokenUsage | undefined = response.usage ? {
      prompt_tokens: response.usage.prompt_tokens || 0,
      completion_tokens: response.usage.completion_tokens || 0,
      total_tokens: response.usage.total_tokens || 0,
      cached_tokens: (response.usage as any).cached_tokens || 0,
    } : undefined;
    
    return {
      generatedText: content.trim(),
      usage,
      model: modelConfig.model,
    };
  } catch (error) {
    console.error('Error generating document item:', error);
    throw error;
  }
}

