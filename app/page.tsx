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
    totalCost: 0,
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
  });

  const handleAgentResult = useCallback((result: any) => {
    setState((prev) => {
      const newState = { ...prev };
      
      // Update agent state
      newState.agentState = result.state;
      
      // Debug logging
      console.log(`[Frontend] Received result:`, {
        totalCost: result.totalCost,
        totalTokens: result.totalTokens,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        lastModel: result.lastModel,
        prevTotalCost: prev.totalCost,
      });
      
      // Update cost and tokens if provided
      // Use nullish coalescing to allow 0 values
      if (result.totalCost !== undefined && result.totalCost !== null) {
        newState.totalCost = result.totalCost;
        console.log(`[Frontend] Updated totalCost to: ${newState.totalCost}`);
      } else {
        console.warn(`[Frontend] totalCost is undefined or null, keeping previous value: ${prev.totalCost}`);
      }
      if (result.totalTokens !== undefined) {
        newState.totalTokens = result.totalTokens;
      }
      if (result.promptTokens !== undefined) {
        newState.promptTokens = result.promptTokens;
      }
      if (result.completionTokens !== undefined) {
        newState.completionTokens = result.completionTokens;
      }
      if (result.lastModel !== undefined) {
        newState.lastModel = result.lastModel;
      }
      
      // Add chat messages
      newState.chatMessages = [
        ...prev.chatMessages,
        ...result.chatMessages,
      ];
      
      // Update document
      console.log(`[Frontend] Document update logic:`, {
        resultType: result.type,
        hasDocumentPatch: !!result.documentPatch,
        prevDocument: !!prev.document,
        documentPatchId: result.documentPatch?.id,
        documentPatchSections: result.documentPatch?.sections?.length,
        documentPatchClauses: result.documentPatch?.clauses?.length,
      });

      if (result.type === "continue" || result.type === "need_user_input") {
        if (result.documentPatch) {
          // Always update document if documentPatch is provided
          if (result.documentPatch.id && result.documentPatch.mission) {
            // Merge with previous document if it exists, or create new one
            newState.document = {
              ...(prev.document || {}),
              id: result.documentPatch.id,
              mission: result.documentPatch.mission,
              sections: result.documentPatch.sections || prev.document?.sections || [],
              clauses: result.documentPatch.clauses || prev.document?.clauses || [],
              stylePreset: result.documentPatch.stylePreset || prev.document?.stylePreset || { name: "default", language: "ru" },
              createdAt: prev.document?.createdAt || new Date(),
              updatedAt: new Date(),
            };
            console.log(`[Frontend] Updated document:`, {
              id: newState.document.id,
              sections: newState.document.sections.length,
              clauses: newState.document.clauses.length,
            });
          } else if (prev.document) {
            // Merge patch into existing document
            newState.document = {
              ...prev.document,
              ...result.documentPatch,
              updatedAt: new Date(),
            };
            console.log(`[Frontend] Merged documentPatch into existing document`);
          }
        } else {
          console.log(`[Frontend] No documentPatch provided, keeping previous document`);
        }
      } else if (result.type === "finished") {
        newState.document = result.document;
        console.log(`[Frontend] Document finished, set to:`, {
          id: result.document.id,
          sections: result.document.sections.length,
          clauses: result.document.clauses.length,
        });
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
          totalCost={state.totalCost}
          lastModel={state.lastModel}
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

