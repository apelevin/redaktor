/**
 * UI State Management
 * Manages the application state for the frontend
 */

import type { UIState, LegalDocument, AgentState, UserQuestion, ChatMessage } from "./types";

export class UIStateManager {
  private state: UIState;

  constructor(initialState?: Partial<UIState>) {
    this.state = {
      document: null,
      agentState: null,
      pendingQuestion: undefined,
      chatMessages: [],
      isLoading: false,
      error: undefined,
      ...initialState,
    };
  }

  getState(): UIState {
    return { ...this.state };
  }

  setDocument(document: LegalDocument | null): void {
    this.state.document = document;
  }

  setAgentState(agentState: AgentState | null): void {
    this.state.agentState = agentState;
  }

  setPendingQuestion(question: UserQuestion | undefined): void {
    this.state.pendingQuestion = question;
  }

  addChatMessage(message: ChatMessage): void {
    this.state.chatMessages.push(message);
  }

  addChatMessages(messages: ChatMessage[]): void {
    this.state.chatMessages.push(...messages);
  }

  setLoading(isLoading: boolean): void {
    this.state.isLoading = isLoading;
  }

  setError(error: string | undefined): void {
    this.state.error = error;
  }

  clearError(): void {
    this.state.error = undefined;
  }

  reset(): void {
    this.state = {
      document: null,
      agentState: null,
      pendingQuestion: undefined,
      chatMessages: [],
      isLoading: false,
      error: undefined,
    };
  }
}

