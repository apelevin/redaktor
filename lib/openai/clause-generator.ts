import { getOpenAIClient } from './client';
import { loadAndRenderPrompt } from '@/lib/utils/prompt-loader';
import { getModelConfig } from './models';
import type { TokenUsage } from '@/lib/utils/cost-calculator';
import type { Clause } from '@/types/document';

export interface ClauseGenerationParams {
  document_type: string;
  current_section: string;
  qa_context: Array<{ question: string; answer: string }>;
  jurisdiction?: string;
  style?: string;
  related_norms?: string[];
  clauses_summary?: string[];
  contract_variables?: Record<string, any>;
}

export interface GeneratedClause {
  clause: Clause;
  assumptions: string[];
  related_norms: string[];
  usage?: TokenUsage;
  model?: string;
}

export async function generateClause(
  params: ClauseGenerationParams
): Promise<GeneratedClause> {
  const client = getOpenAIClient();
  
  const qaContextText = params.qa_context
    .map(qa => `В: ${qa.question}\nО: ${qa.answer}`)
    .join('\n\n');
  
  const clausesSummaryText = params.clauses_summary?.join('\n') || '';
  const relatedNormsText = params.related_norms?.join('\n') || '';
  const contractVariablesText = params.contract_variables
    ? JSON.stringify(params.contract_variables, null, 2)
    : '';
  
  const prompt = await loadAndRenderPrompt('clause-generation.md', {
    document_type: params.document_type,
    jurisdiction: params.jurisdiction ? `Юрисдикция: ${params.jurisdiction}` : '',
    style: params.style ? `Стиль: ${params.style}` : '',
    current_section: params.current_section,
    qa_context: qaContextText || 'Контекст не собран.',
    clauses_summary: clausesSummaryText || 'Пока нет созданных пунктов.',
    related_norms: relatedNormsText || 'Нет связанных норм.',
    contract_variables: contractVariablesText || 'Нет переменных договора.',
  });
  
  try {
    const modelConfig = getModelConfig('clause_generation');
    
    const response = await client.chat.completions.create({
      model: modelConfig.model,
      messages: [
        {
          role: 'system',
          content: 'Ты юридический эксперт, который создает формулировки пунктов документов. Всегда возвращай валидный JSON.',
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
      ...(modelConfig.service_tier && { service_tier: modelConfig.service_tier }),
      response_format: { type: 'json_object' },
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }
    
    const result = JSON.parse(content);
    
    // Возвращаем данные об использовании токенов для расчета стоимости на клиенте
    const usage: TokenUsage | undefined = response.usage ? {
      prompt_tokens: response.usage.prompt_tokens || 0,
      completion_tokens: response.usage.completion_tokens || 0,
      total_tokens: response.usage.total_tokens || 0,
      cached_tokens: (response.usage as any).cached_tokens || 0,
    } : undefined;
    
    const clause: Clause = {
      id: `clause-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sectionId: params.current_section,
      content: result.clause || '',
      source: 'llm',
      metadata: {
        assumptions: result.assumptions || [],
        related_norms: result.related_norms || [],
      },
    };
    
    return {
      clause,
      assumptions: result.assumptions || [],
      related_norms: result.related_norms || [],
      usage,
      model: modelConfig.model,
    };
  } catch (error) {
    console.error('Error generating clause:', error);
    throw error;
  }
}

