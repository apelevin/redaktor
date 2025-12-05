/**
 * Калькулятор стоимости использования OpenAI API
 * Цены в долларах за 1M токенов (Standard tier)
 */

export interface ModelPricing {
  input: number;      // цена за 1M input токенов
  cached?: number;    // цена за 1M cached input токенов
  output: number;     // цена за 1M output токенов
}

/**
 * Таблица цен для моделей (Standard tier)
 */
const PRICING: Record<string, ModelPricing> = {
  'gpt-5.1': {
    input: 1.25,
    cached: 0.125,
    output: 10.00,
  },
  'gpt-5': {
    input: 1.25,
    cached: 0.125,
    output: 10.00,
  },
  'gpt-5-mini': {
    input: 0.25,
    cached: 0.025,
    output: 2.00,
  },
  'gpt-5-nano': {
    input: 0.05,
    cached: 0.005,
    output: 0.40,
  },
  'gpt-5.1-codex-max': {
    input: 1.25,
    cached: 0.125,
    output: 10.00,
  },
  'gpt-5.1-codex': {
    input: 1.25,
    cached: 0.125,
    output: 10.00,
  },
  'gpt-5-codex': {
    input: 1.25,
    cached: 0.125,
    output: 10.00,
  },
  'gpt-4.1': {
    input: 2.00,
    cached: 0.50,
    output: 8.00,
  },
  'gpt-4.1-mini': {
    input: 0.40,
    cached: 0.10,
    output: 1.60,
  },
  'gpt-4.1-nano': {
    input: 0.10,
    cached: 0.025,
    output: 0.40,
  },
  'gpt-4o': {
    input: 2.50,
    cached: 1.25,
    output: 10.00,
  },
  'gpt-4o-mini': {
    input: 0.15,
    cached: 0.075,
    output: 0.60,
  },
};

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cached_tokens?: number;
}

export interface CostCalculation {
  inputCost: number;
  cachedCost: number;
  outputCost: number;
  totalCost: number;
}

/**
 * Рассчитать стоимость использования токенов для модели
 */
export function calculateCost(
  model: string,
  usage: TokenUsage
): CostCalculation {
  const pricing = PRICING[model];
  
  if (!pricing) {
    console.warn(`Unknown model pricing for: ${model}, using gpt-5.1 pricing`);
    // Fallback на gpt-5.1 если модель не найдена
    return calculateCost('gpt-5.1', usage);
  }
  
  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  const cachedTokens = usage.cached_tokens || 0;
  
  // Рассчитываем стоимость input токенов (минус cached)
  const nonCachedInputTokens = Math.max(0, promptTokens - cachedTokens);
  const inputCost = (nonCachedInputTokens / 1_000_000) * pricing.input;
  
  // Рассчитываем стоимость cached токенов
  const cachedCost = cachedTokens > 0 && pricing.cached
    ? (cachedTokens / 1_000_000) * pricing.cached
    : 0;
  
  // Рассчитываем стоимость output токенов
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  
  const totalCost = inputCost + cachedCost + outputCost;
  
  return {
    inputCost,
    cachedCost,
    outputCost,
    totalCost,
  };
}

/**
 * Форматировать стоимость для отображения
 */
export function formatCost(cost: number): string {
  if (cost === 0 || isNaN(cost)) {
    return '$0.00';
  }
  if (cost < 0.0001) {
    // Для очень малых значений показываем в миллицентах
    const millicents = cost * 100000; // конвертируем в миллиценты
    return `${millicents.toFixed(2)}¢`;
  }
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(4)}`;
}

/**
 * Получить цену для модели (для справки)
 */
export function getModelPricing(model: string): ModelPricing | null {
  return PRICING[model] || null;
}

