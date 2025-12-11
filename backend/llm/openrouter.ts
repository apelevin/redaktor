/**
 * OpenRouter LLM Client
 * Handles all LLM interactions through OpenRouter API
 */

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export class OpenRouterClient {
  private apiKey: string;
  private baseUrl: string = "https://openrouter.ai/api/v1";
  private defaultModel: string = "anthropic/claude-3.5-sonnet";
  private defaultConfig: OpenRouterConfig = {
    temperature: 0.7,
    maxTokens: 4000,
  };

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || "";
    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY is required");
    }
  }

  /**
   * Call LLM with messages and optional config
   */
  async chat(
    messages: OpenRouterMessage[],
    config?: OpenRouterConfig
  ): Promise<string> {
    const model = config?.model || this.defaultModel;
    const temperature = config?.temperature ?? this.defaultConfig.temperature;
    const maxTokens = config?.maxTokens ?? this.defaultConfig.maxTokens;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          "X-Title": "LegalAGI",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || "";
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`OpenRouter request failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Call LLM with retry logic
   */
  async chatWithRetry(
    messages: OpenRouterMessage[],
    config?: OpenRouterConfig,
    maxRetries: number = 3
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.chat(messages, config);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries - 1) {
          // Exponential backoff
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000)
          );
        }
      }
    }

    throw lastError || new Error("Failed to call OpenRouter after retries");
  }

  /**
   * Parse JSON response from LLM
   */
  async chatJSON<T>(
    messages: OpenRouterMessage[],
    config?: OpenRouterConfig
  ): Promise<T> {
    const model = config?.model || this.defaultModel;
    console.log(`[OpenRouter] Calling model: ${model}`);
    
    const response = await this.chatWithRetry(messages, config);
    console.log(`[OpenRouter] Raw response length: ${response.length} chars`);
    
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : response;
      const parsed = JSON.parse(jsonString) as T;
      console.log(`[OpenRouter] Parsed JSON successfully`);
      return parsed;
    } catch (error) {
      console.error(`[OpenRouter] Failed to parse JSON. Response: ${response.substring(0, 500)}`);
      throw new Error(
        `Failed to parse JSON response: ${error}. Response: ${response.substring(0, 500)}`
      );
    }
  }
}

// Singleton instance
let clientInstance: OpenRouterClient | null = null;

export function getOpenRouterClient(): OpenRouterClient {
  if (!clientInstance) {
    clientInstance = new OpenRouterClient();
  }
  return clientInstance;
}

