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
  ReasoningLevel,
} from "@/lib/types";
import "./page.css";

export default function Home() {
  // PRO: Generate conversationId on mount (обязательное поле согласно archv2.md)
  const conversationIdRef = useRef<string>(`conv-${Date.now()}`);
  
  // Reasoning level selection (выбирается единожды в начале согласно reasoning.md)
  const [selectedReasoningLevel, setSelectedReasoningLevel] = useState<ReasoningLevel | null>(null);
  
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

  const handleAgentResult = useCallback((response: any) => {
    setState((prev) => {
      const newState = { ...prev };
      
      // Extract result from response
      const result = response.result || response;
      
      // Update agent state
      newState.agentState = result.state;
      
      // Debug logging
      console.log(`[Frontend] Received result:`, {
        totalCost: response.totalCost,
        tokens: {
          prompt: response.promptTokens,
          completion: response.completionTokens,
          total: response.totalTokens,
          calculatedTotal: (response.promptTokens !== undefined && response.completionTokens !== undefined) 
            ? response.promptTokens + response.completionTokens 
            : undefined,
        },
        lastModel: response.lastModel,
        prevTotalCost: prev.totalCost,
        prevTokens: {
          prompt: prev.promptTokens,
          completion: prev.completionTokens,
          total: prev.totalTokens,
        },
      });
      
      // Update cost and tokens from response
      newState.totalCost = response.totalCost ?? prev.totalCost;
      newState.totalTokens = response.totalTokens ?? prev.totalTokens;
      newState.promptTokens = response.promptTokens ?? prev.promptTokens;
      newState.completionTokens = response.completionTokens ?? prev.completionTokens;
      newState.lastModel = response.lastModel ?? prev.lastModel;
      
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
        documentPatchSections: result.documentPatch?.skeleton?.sections?.length,
        documentPatchClauses: result.documentPatch?.clauseDrafts?.length,
        responseTotalCost: response.totalCost,
      });

      if (result.type === "continue" || result.type === "need_user_input") {
        if (result.documentPatch) {
          // Always update document if documentPatch is provided
          if (result.documentPatch.id && result.documentPatch.mission) {
            // Merge with previous document if it exists, or create new one
            // PRO: Support both new structure and legacy
            newState.document = {
              ...(prev.document || {}),
              id: result.documentPatch.id,
              mission: result.documentPatch.mission || prev.document?.mission,
              // PRO: new structure
              profile: result.documentPatch.profile || prev.document?.profile,
              skeleton: result.documentPatch.skeleton || prev.document?.skeleton,
              clauseRequirements: result.documentPatch.clauseRequirements || prev.document?.clauseRequirements,
              clauseDrafts: result.documentPatch.clauseDrafts || prev.document?.clauseDrafts,
              finalText: result.documentPatch.finalText || prev.document?.finalText,
              stylePreset: result.documentPatch.stylePreset || prev.document?.stylePreset || { 
                id: "default",
                family: "balanced",
                sentenceLength: "medium",
                formality: "medium",
                definitionPlacement: "inline",
                crossReferenceFormat: "numeric",
              },
              createdAt: prev.document?.createdAt || new Date(),
              updatedAt: new Date(),
            };
            console.log(`[Frontend] Updated document:`, {
              id: newState.document.id,
              sections: newState.document.skeleton.sections.length,
              clauses: newState.document.clauseDrafts.length,
              hasProfile: !!newState.document.profile,
            });
          } else if (prev.document) {
            // Merge patch into existing document (обязательные поля должны быть сохранены)
            newState.document = {
              ...prev.document,
              ...result.documentPatch,
              // Убеждаемся, что обязательные поля не потеряны
              profile: result.documentPatch.profile || prev.document.profile,
              skeleton: result.documentPatch.skeleton || prev.document.skeleton,
              clauseRequirements: result.documentPatch.clauseRequirements || prev.document.clauseRequirements,
              clauseDrafts: result.documentPatch.clauseDrafts || prev.document.clauseDrafts,
              finalText: result.documentPatch.finalText || prev.document.finalText,
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
                      (doc.clauseDrafts?.length || 0) > (prev.document.clauseDrafts?.length || 0) ||
                      (doc.skeleton?.sections?.length || 0) > (prev.document.skeleton?.sections?.length || 0)) {
                    console.log(`[Frontend] Loaded document from storage:`, {
                      sections: doc.skeleton?.sections?.length || 0,
                      clauses: doc.clauseDrafts?.length || 0,
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
          sections: result.document.skeleton.sections.length,
          clauses: result.document.clauseDrafts.length,
        });
      }
      
      // Handle pending question
      if (result.type === "need_user_input") {
        newState.pendingQuestion = result.question;
      } else {
        newState.pendingQuestion = undefined;
      }

      // PRO: Handle highlighted sections/clauses from result
      // These will be passed to DocumentPane
      // (highlightedSectionId and highlightedClauseId are already in DocumentPane props)
      
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
                lastClauseCountRef.current = state.document.clauseDrafts.length;
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
                              const currentClauseCount = prev.document?.clauseDrafts.length || 0;
                              const newClauseCount = document.clauseDrafts.length;
                              const currentSectionCount = prev.document?.skeleton.sections.length || 0;
                              const newSectionCount = document.skeleton.sections.length;
                
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
        // PRO: conversationId обязателен согласно archv2.md
        const conversationId = state.agentState?.conversationId || conversationIdRef.current;
        conversationIdRef.current = conversationId; // Сохраняем для последующих запросов
        
        // PRO: Передаем reasoningLevel только для первого запроса (согласно reasoning.md)
        const reasoningLevelToSend = state.agentState === null && selectedReasoningLevel !== null 
          ? selectedReasoningLevel 
          : undefined;
        
        const result = await agentClient.sendMessage(
          message,
          state.agentState,
          conversationId,
          reasoningLevelToSend
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
        // PRO: conversationId обязателен согласно archv2.md
        if (!state.agentState?.conversationId) {
          throw new Error("AgentState must have conversationId");
        }
        
        const result = await agentClient.answerQuestion(
          answer,
          state.agentState,
          state.agentState.conversationId,
          undefined, // documentChanges (legacy)
          undefined // documentPatchFromUser (PRO - can be added later)
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
        {/* PRO: highlightedSectionId and highlightedClauseId from result are handled via pendingQuestion for now */}
        <ChatPane
          messages={state.chatMessages}
          pendingQuestion={state.pendingQuestion}
          isLoading={state.isLoading}
          reasoningLevel={selectedReasoningLevel}
          onReasoningLevelChange={setSelectedReasoningLevel}
          onSendMessage={handleSendMessage}
          onAnswerQuestion={handleAnswerQuestion}
        />
      </div>
    </main>
  );
}

