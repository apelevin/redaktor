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
  service_tier?: 'flex' | 'standard' | 'priority' | 'batch';
}

/**
 * Конфигурация моделей по умолчанию для каждого шага
 */
const defaultModelConfig: Record<PipelineStep, ModelConfig> = {
  question_generation: {
    model: 'gpt-5-mini',
    reasoning_effort: 'low',
    verbosity: 'medium',
    service_tier: 'flex',
  },
  context_completion: {
    model: 'gpt-5-mini',
    reasoning_effort: 'medium',
    verbosity: 'low',
    service_tier: 'flex',
  },
  context_generation: {
    model: 'gpt-5.1',
    reasoning_effort: 'medium',
    verbosity: 'medium',
    service_tier: 'flex',
  },
  terms_generation: {
    model: 'gpt-5-mini',
    reasoning_effort: 'medium',
    verbosity: 'low',
    service_tier: 'flex',
  },
  skeleton_generation: {
    model: 'gpt-5-mini',
    reasoning_effort: 'low',
    verbosity: 'low',
    // Для сложных юрисдикций можно переключить на gpt-5.1 через переменные окружения
    service_tier: 'flex',
  },
  clause_generation: {
    model: 'gpt-5-mini',
    reasoning_effort: 'low',
    verbosity: 'low',
    // Более дорогие модели пригодятся при неоднозначных формулировках или редких правовых системах
    service_tier: 'flex',
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
  
  // Проверяем глобальную переменную окружения для service_tier
  const globalServiceTier = process.env.OPENAI_SERVICE_TIER as ModelConfig['service_tier'] | undefined;
  
  // Проверяем переменную окружения для конкретного шага
  const envServiceTierKey = `OPENAI_SERVICE_TIER_${step.toUpperCase()}` as keyof NodeJS.ProcessEnv;
  const envServiceTier = process.env[envServiceTierKey] as ModelConfig['service_tier'] | undefined;
  
  return {
    model: envModel || defaultConfig.model,
    reasoning_effort: envReasoning || defaultConfig.reasoning_effort,
    verbosity: envVerbosity || defaultConfig.verbosity,
    service_tier: envServiceTier || globalServiceTier || defaultConfig.service_tier || 'flex',
  };
}

/**
 * Получить только название модели для шага
 */
export function getModelForStep(step: PipelineStep): string {
  return getModelConfig(step).model;
}

