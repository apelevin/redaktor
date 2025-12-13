import { LLMStepOutput } from '@/lib/types';

export interface OpenRouterConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  content: string;
  model?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Клиент для работы с OpenRouter API
 */
export class OpenRouterClient {
  private apiKey: string;
  private defaultModel: string;
  private baseUrl: string;

  constructor(config: OpenRouterConfig) {
    this.apiKey = config.apiKey;
    // Всегда используем google/gemini-2.5-flash
    this.defaultModel = config.model || 'google/gemini-2.5-flash';
    this.baseUrl = config.baseUrl || 'https://openrouter.ai/api/v1';
  }

  /**
   * Отправляет запрос к LLM и возвращает текстовый ответ
   */
  async chat(messages: ChatMessage[]): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'LegalAGI',
      },
      body: JSON.stringify({
        model: this.defaultModel,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: 0.7,
        response_format: { type: 'text' },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`OpenRouter API error: ${errorData.error?.message || errorData.error || `HTTP ${response.status}`}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    if (!choice) {
      throw new Error('No response from OpenRouter API');
    }

    return {
      content: choice.message?.content || '',
      model: data.model,
      usage: data.usage,
    };
  }

  /**
   * Отправляет запрос к LLM и возвращает JSON ответ
   * Использует response_format: { type: 'json_object' }
   */
  async chatJSON<T = unknown>(messages: ChatMessage[]): Promise<{ data: T; model?: string; usage?: ChatResponse['usage'] }> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'LegalAGI',
      },
      body: JSON.stringify({
        model: this.defaultModel,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: 0.3, // Ниже температура для более структурированных ответов
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`OpenRouter API error: ${errorData.error?.message || errorData.error || `HTTP ${response.status}`}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    if (!choice) {
      throw new Error('No response from OpenRouter API');
    }

    const content = choice.message?.content || '{}';
    let parsedData: T;

    try {
      parsedData = JSON.parse(content) as T;
    } catch (error) {
      throw new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      data: parsedData,
      model: data.model,
      usage: data.usage,
    };
  }
}

// Singleton instance
let clientInstance: OpenRouterClient | null = null;

/**
 * Получает экземпляр OpenRouterClient
 */
export function getOpenRouterClient(): OpenRouterClient {
  if (!clientInstance) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is not set');
    }

    clientInstance = new OpenRouterClient({
      apiKey,
      // Модель всегда google/gemini-2.5-flash (дефолт в конструкторе)
    });
  }
  return clientInstance;
}
