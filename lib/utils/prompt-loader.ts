import { readFileSync } from 'fs';
import { join } from 'path';
import { existsSync } from 'fs';

/**
 * Загружает промпт из markdown файла в папке prompts/
 */
export function loadPrompt(filename: string): string {
  try {
    const filePath = join(process.cwd(), 'prompts', filename);
    
    if (!existsSync(filePath)) {
      throw new Error(`Prompt file not found: ${filePath}`);
    }
    
    return readFileSync(filePath, 'utf-8');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load prompt from ${filename}: ${errorMessage}`);
  }
}

/**
 * Подставляет переменные в промпт
 * Использует простую замену {{variable}} на значение
 */
export function renderPrompt(
  template: string,
  variables: Record<string, string | number | boolean | undefined>
): string {
  let rendered = template;
  
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    rendered = rendered.replace(regex, String(value ?? ''));
  }
  
  return rendered;
}

/**
 * Загружает и рендерит промпт с переменными
 */
export function loadAndRenderPrompt(
  filename: string,
  variables: Record<string, string | number | boolean | undefined>
): string {
  const template = loadPrompt(filename);
  return renderPrompt(template, variables);
}

