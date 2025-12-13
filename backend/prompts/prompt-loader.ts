import { readFileSync } from 'fs';
import { join } from 'path';

export interface PromptVariables {
  [key: string]: string | number | boolean;
}

// Кэш промптов для производительности
const promptCache = new Map<string, string>();

/**
 * Загружает промпт из файла и подставляет переменные
 */
export function loadPrompt(
  filename: string,
  variables: PromptVariables
): string {
  // Проверяем кэш
  const cacheKey = filename;
  let template = promptCache.get(cacheKey);

  if (!template) {
    // Загружаем файл (синхронно для Next.js API routes)
    const promptsDir = join(process.cwd(), 'backend', 'prompts');
    const filePath = join(promptsDir, filename);

    try {
      template = readFileSync(filePath, 'utf-8');
      promptCache.set(cacheKey, template);
    } catch (error) {
      throw new Error(`Failed to load prompt file ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Подставляем переменные
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(placeholder, String(value));
  }

  // Проверяем, остались ли неподставленные переменные
  const missingVars = result.match(/\{\{(\w+)\}\}/g);
  if (missingVars && missingVars.length > 0) {
    const missing = [...new Set(missingVars.map((v) => v.replace(/[{}]/g, '')))];
    console.warn(`Warning: Unsubstituted variables in prompt ${filename}: ${missing.join(', ')}`);
  }

  return result;
}

/**
 * Загружает промпт без подстановки (raw)
 */
export function loadPromptRaw(filename: string): string {
  const cacheKey = filename;
  let template = promptCache.get(cacheKey);

  if (!template) {
    const promptsDir = join(process.cwd(), 'backend', 'prompts');
    const filePath = join(promptsDir, filename);

    try {
      template = readFileSync(filePath, 'utf-8');
      promptCache.set(cacheKey, template);
    } catch (error) {
      throw new Error(`Failed to load prompt file ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return template;
}

/**
 * Валидирует наличие всех переменных в промпте
 */
export function validatePromptVariables(
  prompt: string,
  variables: PromptVariables
): { valid: boolean; missing: string[] } {
  const placeholders = prompt.match(/\{\{(\w+)\}\}/g) || [];
  const requiredVars = [...new Set(placeholders.map((p) => p.replace(/[{}]/g, '')))];
  const providedVars = Object.keys(variables);

  const missing = requiredVars.filter((v) => !providedVars.includes(v));

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Очищает кэш промптов (для тестирования или перезагрузки)
 */
export function clearPromptCache(): void {
  promptCache.clear();
}
