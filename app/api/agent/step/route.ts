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

    // Validate request
    if (!body.agentState && !body.userMessage) {
      return NextResponse.json(
        { error: "Either agentState or userMessage is required" },
        { status: 400 }
      );
    }

    // Execute pipeline step
    const result = await executePipelineStep(body);

    // Extract cost and tokens from agent state
    const totalCost = result.state.internalData.totalCost as number | undefined;
    const totalTokens = result.state.internalData.totalTokens as number | undefined;
    const promptTokens = result.state.internalData.promptTokens as number | undefined;
    const completionTokens = result.state.internalData.completionTokens as number | undefined;
    const lastModel = result.state.internalData.lastModel as string | undefined;

    // Load document from storage if it exists (even if not in documentPatch)
    const storage = getStorage();
    let currentDocument: LegalDocument | null = null;
    if (result.state.documentId) {
      currentDocument = storage.getDocument(result.state.documentId) || null;
      console.log(`[API] Loaded document from storage:`, {
        documentId: result.state.documentId,
        hasDocument: !!currentDocument,
        documentSections: currentDocument?.sections?.length || 0,
        documentClauses: currentDocument?.clauses?.length || 0,
      });
    }

    // Debug logging
    console.log(`[API] Extracted from state:`, {
      totalCost,
      totalTokens,
      promptTokens,
      completionTokens,
      lastModel,
      internalDataKeys: Object.keys(result.state.internalData),
      hasDocumentPatch: !!result.documentPatch,
      hasCurrentDocument: !!currentDocument,
    });

    // If document exists but wasn't in documentPatch, add it to the result
    if (currentDocument && (result.type === "continue" || result.type === "need_user_input")) {
      if (!result.documentPatch) {
        // Create documentPatch from current document if it doesn't exist
        result.documentPatch = {
          id: currentDocument.id,
          mission: currentDocument.mission,
          sections: currentDocument.sections,
          clauses: currentDocument.clauses,
          stylePreset: currentDocument.stylePreset,
        };
        console.log(`[API] Added document to documentPatch for frontend`);
      } else {
        // Merge current document with patch to ensure all fields are present
        result.documentPatch = {
          id: currentDocument.id,
          mission: result.documentPatch.mission || currentDocument.mission,
          sections: result.documentPatch.sections || currentDocument.sections,
          clauses: result.documentPatch.clauses || currentDocument.clauses,
          stylePreset: result.documentPatch.stylePreset || currentDocument.stylePreset,
        };
        console.log(`[API] Merged document with documentPatch`);
      }
    }

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

