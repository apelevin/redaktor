/**
 * Agent State Management
 * Utilities for managing AgentState
 */

import type { AgentState } from "@/lib/types";
import type { OpenRouterUsage } from "@/backend/llm/openrouter";

export function createInitialAgentState(documentId: string): AgentState {
  return {
    documentId,
    step: "mission_interpreter",
    internalData: {},
  };
}

export function updateAgentStateStep(
  state: AgentState,
  step: string
): AgentState {
  return {
    ...state,
    step,
  };
}

export function updateAgentStateData(
  state: AgentState,
  data: Partial<AgentState["internalData"]>
): AgentState {
  return {
    ...state,
    internalData: {
      ...state.internalData,
      ...data,
    },
  };
}

/**
 * Update usage statistics in agent state
 */
export function updateUsageStats(
  state: AgentState,
  usage: OpenRouterUsage
): AgentState {
  const internalData = { ...state.internalData };
  
  // Initialize if not exists
  if (typeof internalData.totalCost !== "number") {
    internalData.totalCost = 0;
  }
  if (typeof internalData.totalTokens !== "number") {
    internalData.totalTokens = 0;
  }
  if (typeof internalData.promptTokens !== "number") {
    internalData.promptTokens = 0;
  }
  if (typeof internalData.completionTokens !== "number") {
    internalData.completionTokens = 0;
  }
  
  // Update totals
  const previousCost = internalData.totalCost || 0;
  const usageCost = usage.cost || 0;
  internalData.totalCost = previousCost + usageCost;
  internalData.totalTokens = (internalData.totalTokens || 0) + usage.totalTokens;
  internalData.promptTokens = (internalData.promptTokens || 0) + usage.promptTokens;
  internalData.completionTokens = (internalData.completionTokens || 0) + usage.completionTokens;
  
  // Debug logging
  console.log(`[updateUsageStats] Cost update:`, {
    previousCost,
    usageCost,
    newTotalCost: internalData.totalCost,
    usage: {
      cost: usage.cost,
      totalTokens: usage.totalTokens,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      model: usage.model,
    },
  });
  
  // Store last used model
  if (usage.model) {
    internalData.lastModel = usage.model;
  }
  
  return {
    ...state,
    internalData,
  };
}

export function getNextStep(currentStep: string): string | null {
  const stepOrder = [
    "mission_interpreter",
    "issue_spotter",
    "skeleton_generator",
    "clause_requirements_generator",
    "style_planner",
    "clause_generator",
    "document_linter",
  ];

  const currentIndex = stepOrder.indexOf(currentStep);
  if (currentIndex === -1 || currentIndex === stepOrder.length - 1) {
    return null;
  }

  return stepOrder[currentIndex + 1];
}

