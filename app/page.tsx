"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
        tokens: {
          prompt: result.promptTokens,
          completion: result.completionTokens,
          total: result.totalTokens,
          calculatedTotal: (result.promptTokens !== undefined && result.completionTokens !== undefined) 
            ? result.promptTokens + result.completionTokens 
            : undefined,
        },
        lastModel: result.lastModel,
        prevTotalCost: prev.totalCost,
        prevTokens: {
          prompt: prev.promptTokens,
          completion: prev.completionTokens,
          total: prev.totalTokens,
        },
      });
      
      // Update cost and tokens if provided
      // Use nullish coalescing to allow 0 values
      if (result.totalCost !== undefined && result.totalCost !== null) {
        newState.totalCost = result.totalCost;
        console.log(`[Frontend] Updated totalCost to: ${newState.totalCost}`);
      } else {
        console.warn(`[Frontend] totalCost is undefined or null, keeping previous value: ${prev.totalCost}`);
      }
      
      // Update tokens - prefer explicit values, calculate total if needed
      if (result.promptTokens !== undefined) {
        newState.promptTokens = result.promptTokens;
      }
      if (result.completionTokens !== undefined) {
        newState.completionTokens = result.completionTokens;
      }
      
      // Calculate totalTokens as sum of prompt + completion for accuracy
      if (result.totalTokens !== undefined) {
        // Use provided total, but verify it matches sum
        const calculatedTotal = 
          (newState.promptTokens !== undefined && newState.completionTokens !== undefined)
            ? newState.promptTokens + newState.completionTokens
            : undefined;
        
        if (calculatedTotal !== undefined && Math.abs(calculatedTotal - result.totalTokens) > 0) {
          console.warn(`[Frontend] Token count mismatch: calculated=${calculatedTotal}, API=${result.totalTokens}, using calculated`);
          newState.totalTokens = calculatedTotal;
        } else {
          newState.totalTokens = result.totalTokens;
        }
      } else if (newState.promptTokens !== undefined && newState.completionTokens !== undefined) {
        // Calculate total from prompt + completion if total not provided
        newState.totalTokens = newState.promptTokens + newState.completionTokens;
        console.log(`[Frontend] Calculated totalTokens from sum: ${newState.totalTokens}`);
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
          // If no documentPatch but we have a documentId, try to load document immediately
          if (result.state?.documentId) {
            console.log(`[Frontend] No documentPatch, but have documentId, loading document immediately`);
            // Try to load document immediately
            agentClient.getDocument(result.state.documentId).then((doc) => {
              if (doc) {
                setState((prev) => {
                  // Only update if we don't have a document or new one is different
                  if (!prev.document || 
                      (doc.clauses?.length || 0) > (prev.document.clauses?.length || 0) ||
                      (doc.sections?.length || 0) > (prev.document.sections?.length || 0)) {
                    console.log(`[Frontend] Loaded document from storage:`, {
                      sections: doc.sections?.length || 0,
                      clauses: doc.clauses?.length || 0,
                    });
                    return {
                      ...prev,
                      document: doc,
                    };
                  }
                  return prev;
                });
              }
            }).catch((error) => {
              console.error(`[Frontend] Failed to load document:`, error);
            });
          } else {
            console.log(`[Frontend] No documentPatch provided, keeping previous document`);
          }
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

  // Polling for document updates during clause generation
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastClauseCountRef = useRef<number>(0);

  useEffect(() => {
    const documentId = state.agentState?.documentId;
    const isGenerating = state.isLoading && documentId;
    
    // Start polling if we're loading and have a document ID
    // This will catch clause_generator and any other long-running steps
    if (isGenerating) {
      // Initialize clause count if we have a document
      if (state.document) {
        lastClauseCountRef.current = state.document.clauses?.length || 0;
      }
      
      if (!pollingIntervalRef.current) {
        console.log("[Frontend] Starting polling for document updates", {
          documentId,
          step: state.agentState?.step,
        });
        
        pollingIntervalRef.current = setInterval(async () => {
          if (!documentId) return;
          
          try {
            const document = await agentClient.getDocument(documentId);
            if (document) {
              setState((prev) => {
                const currentClauseCount = prev.document?.clauses?.length || 0;
                const newClauseCount = document.clauses?.length || 0;
                const currentSectionCount = prev.document?.sections?.length || 0;
                const newSectionCount = document.sections?.length || 0;
                
                // Update if we have more clauses, more sections, or document structure changed
                if (
                  newClauseCount > currentClauseCount ||
                  newSectionCount > currentSectionCount ||
                  (document.updatedAt && prev.document?.updatedAt && 
                   new Date(document.updatedAt) > new Date(prev.document.updatedAt))
                ) {
                  console.log(`[Frontend] Polling: Updated document`, {
                    clauses: `${currentClauseCount} -> ${newClauseCount}`,
                    sections: `${currentSectionCount} -> ${newSectionCount}`,
                  });
                  lastClauseCountRef.current = newClauseCount;
                  return {
                    ...prev,
                    document: document,
                  };
                }
                return prev;
              });
            }
          } catch (error) {
            console.error("[Frontend] Polling error:", error);
          }
        }, 1500); // Poll every 1.5 seconds for more responsive updates
      }
    } else {
      // Stop polling if not loading
      if (pollingIntervalRef.current) {
        console.log("[Frontend] Stopping polling", {
          isLoading: state.isLoading,
          hasDocumentId: !!documentId,
        });
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
        lastClauseCountRef.current = 0;
      }
    }

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [state.isLoading, state.agentState?.documentId, state.agentState?.step, state.document]);

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

