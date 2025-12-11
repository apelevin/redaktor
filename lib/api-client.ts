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
} from "./types";

export class AgentAPIClient {
  private baseUrl: string;

  constructor(baseUrl: string = "/api/agent/step") {
    this.baseUrl = baseUrl;
  }

  async step(
    request: AgentStepRequest
  ): Promise<AgentStepResult> {
    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error: ${response.status} - ${error}`);
      }

      const data: AgentStepResponse = await response.json();
      return data.result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to call agent step: ${error.message}`);
      }
      throw error;
    }
  }

  async sendMessage(
    message: string,
    agentState: AgentState | null
  ): Promise<AgentStepResult> {
    return this.step({
      userMessage: message,
      agentState,
    });
  }

  async answerQuestion(
    answer: UserAnswer,
    agentState: AgentState,
    documentChanges?: Partial<LegalDocument>
  ): Promise<AgentStepResult> {
    return this.step({
      userAnswer: answer,
      agentState,
      documentChanges,
    });
  }
}

export const agentClient = new AgentAPIClient();

