/**
 * API Route: /api/agent/step
 * Handles agent pipeline step execution
 */

import { NextRequest, NextResponse } from "next/server";
import { executePipelineStep } from "@/backend/agent/pipeline";
import type { AgentStepRequest, AgentStepResponse } from "@/lib/types";

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

    const response: AgentStepResponse = {
      result,
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

