/**
 * Конфигурация моделей OpenAI для разных шагов пайплайна
 */

export type PipelineStep = 
  | 'question_generation'
  | 'context_completion'
  | 'context_generation'
  | 'terms_generation'
  | 'skeleton_generation'
  | 'clause_generation';

export interface ModelConfig {
  model: string;
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high';
  verbosity?: 'low' | 'medium' | 'high';
}

/**
 * Конфигурация моделей по умолчанию для каждого шага
 */
const defaultModelConfig: Record<PipelineStep, ModelConfig> = {
  question_generation: {
    model: 'gpt-5-mini',
    reasoning_effort: 'low',
    verbosity: 'medium',
  },
  context_completion: {
    model: 'gpt-5-mini',
    reasoning_effort: 'medium',
    verbosity: 'low',
  },
  context_generation: {
    model: 'gpt-5.1',
    reasoning_effort: 'medium',
    verbosity: 'medium',
  },
  terms_generation: {
    model: 'gpt-5-mini',
    reasoning_effort: 'medium',
    verbosity: 'low',
  },
  skeleton_generation: {
    model: 'gpt-5.1',
    reasoning_effort: 'medium',
    verbosity: 'medium',
  },
  clause_generation: {
    model: 'gpt-5.1',
    reasoning_effort: 'medium',
    verbosity: 'high',
  },
};

/**
 * Получить конфигурацию модели для конкретного шага
 * Поддерживает переопределение через переменные окружения
 */
export function getModelConfig(step: PipelineStep): ModelConfig {
  const defaultConfig = defaultModelConfig[step];
  
  // Проверяем переменные окружения для переопределения
  const envModelKey = `OPENAI_MODEL_${step.toUpperCase()}` as keyof NodeJS.ProcessEnv;
  const envModel = process.env[envModelKey];
  
  const envReasoningKey = `OPENAI_REASONING_${step.toUpperCase()}` as keyof NodeJS.ProcessEnv;
  const envReasoning = process.env[envReasoningKey] as ModelConfig['reasoning_effort'] | undefined;
  
  const envVerbosityKey = `OPENAI_VERBOSITY_${step.toUpperCase()}` as keyof NodeJS.ProcessEnv;
  const envVerbosity = process.env[envVerbosityKey] as ModelConfig['verbosity'] | undefined;
  
  return {
    model: envModel || defaultConfig.model,
    reasoning_effort: envReasoning || defaultConfig.reasoning_effort,
    verbosity: envVerbosity || defaultConfig.verbosity,
  };
}

/**
 * Получить только название модели для шага
 */
export function getModelForStep(step: PipelineStep): string {
  return getModelConfig(step).model;
}

