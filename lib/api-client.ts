/**
 * API Client for /agent/step endpoint
 */

import type {
  AgentStepRequest,
  AgentStepResponse,
  AgentStepResult,
  AgentState,
  UserAnswer,
  LegalDocument,
  ReasoningLevel,
} from "./types";

export interface AgentStepResponseWithCost {
  result: AgentStepResult;
  totalCost?: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  lastModel?: string;
}

export class AgentAPIClient {
  private baseUrl: string;

  constructor(baseUrl: string = "/api/agent/step") {
    this.baseUrl = baseUrl;
  }

  async step(
    request: AgentStepRequest
  ): Promise<AgentStepResponseWithCost> {
    try {
      // PRO: conversationId обязателен согласно archv2.md
      if (!request.conversationId && !request.agentState?.conversationId) {
        throw new Error("conversationId is required");
      }
      const requestBody: AgentStepRequest = {
        ...request,
        conversationId: request.conversationId || request.agentState!.conversationId,
      };

      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error: ${response.status} - ${error}`);
      }

      const data: AgentStepResponse = await response.json();
      
      // Debug logging
      console.log(`[API Client] Received response:`, {
        totalCost: data.totalCost,
        totalTokens: data.totalTokens,
        promptTokens: data.promptTokens,
        completionTokens: data.completionTokens,
        lastModel: data.lastModel,
      });
      
      const result: AgentStepResponseWithCost = {
        result: data.result,
        totalCost: data.totalCost,
        totalTokens: data.totalTokens,
        promptTokens: data.promptTokens,
        completionTokens: data.completionTokens,
        lastModel: data.lastModel,
      };
      
      console.log(`[API Client] Returning result with totalCost:`, result.totalCost);
      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to call agent step: ${error.message}`);
      }
      throw error;
    }
  }

  async sendMessage(
    message: string,
    agentState: AgentState | null,
    conversationId: string,
    reasoningLevel?: ReasoningLevel
  ): Promise<AgentStepResponseWithCost> {
    return this.step({
      conversationId,
      userMessage: message,
      agentState,
      reasoningLevel, // Передаем только для первого запроса
    });
  }

  async answerQuestion(
    answer: UserAnswer,
    agentState: AgentState,
    conversationId: string,
    documentChanges?: Partial<LegalDocument>,
    documentPatchFromUser?: Partial<LegalDocument>
  ): Promise<AgentStepResponseWithCost> {
    return this.step({
      conversationId,
      userAnswer: answer,
      agentState,
      documentChanges, // Legacy
      documentPatchFromUser, // PRO
    });
  }

  /**
   * Get current document state
   */
  async getDocument(documentId: string): Promise<LegalDocument | null> {
    try {
      const response = await fetch(`/api/document/${documentId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        const error = await response.text();
        throw new Error(`API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      return data.document || null;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get document: ${error.message}`);
      }
      throw error;
    }
  }
}

export const agentClient = new AgentAPIClient();

