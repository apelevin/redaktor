/**
 * API Route: /api/agent/step
 * Handles agent pipeline step execution
 */

import { NextRequest, NextResponse } from "next/server";
import { executePipelineStep } from "@/backend/agent/pipeline";
import { getStorage } from "@/backend/storage/in-memory";
import type { AgentStepRequest, AgentStepResponse, LegalDocument } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body: AgentStepRequest = await request.json();

    // Validate request - conversationId обязателен согласно archv2.md
    if (!body.conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }

    if (!body.agentState && !body.userMessage) {
      return NextResponse.json(
        { error: "Either agentState or userMessage is required" },
        { status: 400 }
      );
    }

    // Execute pipeline step
    const result = await executePipelineStep(body);

    // Extract cost and tokens from agent state
    // PRO: Ensure internalData exists (может быть пустым при первом запросе)
    const internalData = result.state.internalData || {};
    const totalCost = internalData.totalCost as number | undefined;
    const promptTokens = internalData.promptTokens as number | undefined;
    const completionTokens = internalData.completionTokens as number | undefined;
    
    // Calculate totalTokens as sum of prompt + completion to ensure accuracy
    // This ensures we always have correct total even if state.totalTokens is outdated
    const calculatedTotalTokens = 
      (promptTokens !== undefined && completionTokens !== undefined) 
        ? promptTokens + completionTokens 
        : (result.state.internalData.totalTokens as number | undefined);
    
    const totalTokens = calculatedTotalTokens;
    const lastModel = result.state.internalData.lastModel as string | undefined;

    // Load document from storage if it exists (even if not in documentPatch)
    const storage = getStorage();
    let currentDocument: LegalDocument | null = null;
    if (result.state.documentId) {
      currentDocument = storage.getDocument(result.state.documentId) || null;
      console.log(`[API] Loaded document from storage:`, {
        documentId: result.state.documentId,
        hasDocument: !!currentDocument,
        documentSections: currentDocument?.skeleton?.sections?.length || 0,
        documentClauses: currentDocument?.clauseDrafts?.length || 0,
      });
    }

    // Debug logging with token breakdown
    console.log(`[API] Extracted from state:`, {
      totalCost,
      tokens: {
        prompt: promptTokens,
        completion: completionTokens,
        calculatedTotal: calculatedTotalTokens,
        stateTotal: result.state.internalData.totalTokens,
        finalTotal: totalTokens,
      },
      lastModel,
      internalDataKeys: Object.keys(internalData),
      hasDocumentPatch: result.type !== "finished" ? !!result.documentPatch : false,
      hasCurrentDocument: !!currentDocument,
    });

    // PRO: If document exists but wasn't in documentPatch, add it to the result
    if (currentDocument && result.type !== "finished" && (result.type === "continue" || result.type === "need_user_input")) {
      if (!result.documentPatch) {
        // Create documentPatch from current document if it doesn't exist
        result.documentPatch = {
          id: currentDocument.id,
          mission: currentDocument.mission,
          // PRO: обязательные поля согласно archv2.md
          profile: currentDocument.profile,
          skeleton: currentDocument.skeleton,
          clauseRequirements: currentDocument.clauseRequirements,
          clauseDrafts: currentDocument.clauseDrafts,
          finalText: currentDocument.finalText,
          stylePreset: currentDocument.stylePreset,
        };
        console.log(`[API] Added document to documentPatch for frontend`);
      } else {
        // Merge current document with patch to ensure all fields are present
        result.documentPatch = {
          id: currentDocument.id,
          mission: result.documentPatch.mission || currentDocument.mission,
          // PRO: обязательные поля согласно archv2.md
          profile: result.documentPatch.profile || currentDocument.profile,
          skeleton: result.documentPatch.skeleton || currentDocument.skeleton,
          clauseRequirements: result.documentPatch.clauseRequirements || currentDocument.clauseRequirements,
          clauseDrafts: result.documentPatch.clauseDrafts || currentDocument.clauseDrafts,
          finalText: result.documentPatch.finalText || currentDocument.finalText,
          stylePreset: result.documentPatch.stylePreset || currentDocument.stylePreset,
        };
        console.log(`[API] Merged document with documentPatch`);
      }
    }

    // PRO: Pass through highlightedSectionId and highlightedClauseId from result
    // (These are already in result, will be available in response)

    const response: AgentStepResponse = {
      result,
      totalCost,
      totalTokens,
      promptTokens,
      completionTokens,
      lastModel,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in /api/agent/step:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}

