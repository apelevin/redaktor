"use client";

import { useState, useCallback } from "react";
import DocumentPane from "@/components/DocumentPane";
import ChatPane from "@/components/ChatPane";
import { agentClient } from "@/lib/api-client";
import type {
  UIState,
  ChatMessage,
  UserAnswer,
  AgentStepResult,
} from "@/lib/types";
import "./page.css";

export default function Home() {
  const [state, setState] = useState<UIState>({
    document: null,
    agentState: null,
    pendingQuestion: undefined,
    chatMessages: [],
    isLoading: false,
    error: undefined,
  });

  const handleAgentResult = useCallback((result: AgentStepResult) => {
    setState((prev) => {
      const newState = { ...prev };
      
      // Update agent state
      newState.agentState = result.state;
      
      // Add chat messages
      newState.chatMessages = [
        ...prev.chatMessages,
        ...result.chatMessages,
      ];
      
      // Update document
      if (result.type === "continue" || result.type === "need_user_input") {
        if (result.documentPatch) {
          if (prev.document) {
            newState.document = {
              ...prev.document,
              ...result.documentPatch,
            };
          } else if (result.documentPatch.id && result.documentPatch.mission) {
            // Create new document from patch if it contains required fields
            newState.document = {
              id: result.documentPatch.id,
              mission: result.documentPatch.mission!,
              sections: result.documentPatch.sections || [],
              clauses: result.documentPatch.clauses || [],
              stylePreset: result.documentPatch.stylePreset!,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          }
        }
      } else if (result.type === "finished") {
        newState.document = result.document;
      }
      
      // Handle pending question
      if (result.type === "need_user_input") {
        newState.pendingQuestion = result.question;
      } else {
        newState.pendingQuestion = undefined;
      }
      
      newState.isLoading = false;
      
      return newState;
    });
  }, []);

  const handleSendMessage = useCallback(
    async (message: string) => {
      // Add user message to chat
      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "user",
        content: message,
        timestamp: new Date(),
      };

      setState((prev) => ({
        ...prev,
        chatMessages: [...prev.chatMessages, userMessage],
        isLoading: true,
        error: undefined,
      }));

      try {
        const result = await agentClient.sendMessage(
          message,
          state.agentState
        );
        handleAgentResult(result);
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : "Произошла ошибка",
        }));
      }
    },
    [state.agentState, handleAgentResult]
  );

  const handleAnswerQuestion = useCallback(
    async (answer: UserAnswer) => {
      if (!state.agentState) return;

      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: undefined,
      }));

      try {
        const result = await agentClient.answerQuestion(
          answer,
          state.agentState
        );
        handleAgentResult(result);
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : "Произошла ошибка",
        }));
      }
    },
    [state.agentState, handleAgentResult]
  );

  return (
    <main className="main-container">
      {state.error && (
        <div className="error-banner">
          <span>Ошибка: {state.error}</span>
          <button onClick={() => setState((prev) => ({ ...prev, error: undefined }))}>
            ✕
          </button>
        </div>
      )}
      
      <div className="workspace">
        <DocumentPane
          document={state.document}
          highlightedSectionId={state.pendingQuestion?.relatesToSectionId}
          highlightedClauseId={state.pendingQuestion?.relatesToClauseId}
        />
        <ChatPane
          messages={state.chatMessages}
          pendingQuestion={state.pendingQuestion}
          isLoading={state.isLoading}
          onSendMessage={handleSendMessage}
          onAnswerQuestion={handleAnswerQuestion}
        />
      </div>
    </main>
  );
}

