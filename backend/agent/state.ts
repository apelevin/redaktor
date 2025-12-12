/**
 * Agent State Management
 * Utilities for managing AgentState
 */

import type { AgentState, PipelineStepId } from "@/lib/types";
import type { OpenRouterUsage } from "@/backend/llm/openrouter";
import { getSizePolicy } from "./rules/sizePolicy";

/**
 * Create initial agent state with PRO architecture (archv2.md)
 * reasoningLevel опционален - будет установлен позже из UI или HITL согласно reasoning.md
 */
export function createInitialAgentState(
  documentId: string,
  conversationId: string,
  reasoningLevel?: "basic" | "standard" | "professional"
): AgentState {
  // PRO: Default plan for pipeline execution
  const defaultPlan: PipelineStepId[] = [
    "mission_interpreter",
    "profile_builder",
    "party_details_collector",
    "decision_collector",
    "issue_spotter",
    "skeleton_generator",
    "clause_requirements_generator",
    "style_planner",
    "clause_generator",
    "document_linter",
  ];

  // PRO: Initialize required fields according to archv2.md
  // Используем переданный reasoningLevel или default "standard"
  const finalReasoningLevel = reasoningLevel || "standard";
  const sizePolicy = getSizePolicy(finalReasoningLevel);

  return {
    conversationId,
    documentId,
    plan: defaultPlan,
    stepCursor: 0,
    step: "mission_interpreter", // Legacy: for backward compatibility
    // PRO: обязательные поля на верхнем уровне
    sizePolicy,
    parties: [],
    decisions: {},
    internalData: {},
  };
}

export function updateAgentStateStep(
  state: AgentState,
  step: string
): AgentState {
  // Legacy: update step for backward compatibility
  return {
    ...state,
    step,
  };
}

/**
 * Get current step from plan and cursor (PRO)
 */
export function getCurrentStepFromPlan(state: AgentState): string | null {
  if (state.plan && state.plan.length > 0 && state.stepCursor >= 0) {
    if (state.stepCursor < state.plan.length) {
      return state.plan[state.stepCursor];
    }
  }
  // Fallback to legacy step
  return state.step || null;
}

/**
 * Advance step cursor (PRO)
 */
export function advanceStepCursor(state: AgentState): AgentState {
  if (state.plan && state.stepCursor < state.plan.length - 1) {
    return {
      ...state,
      stepCursor: state.stepCursor + 1,
      step: state.plan[state.stepCursor + 1], // Update legacy step too
    };
  }
  return state;
}

/**
 * Update agent state data - supports both top-level fields and internalData
 */
export function updateAgentStateData(
  state: AgentState,
  data: Partial<AgentState["internalData"]> & Partial<Pick<AgentState, "mission" | "profile" | "skeleton" | "clauseRequirements" | "clauseDrafts" | "highlightedSectionId" | "highlightedClauseId" | "sizePolicy" | "parties" | "decisions">>
): AgentState {
  // Separate top-level fields from internalData
  const {
    issues,
    stylePreset,
    totalCost,
    totalTokens,
    promptTokens,
    completionTokens,
    lastModel,
    lastAnswer,
    ...topLevelFields
  } = data as any;

  const internalDataUpdate: Partial<AgentState["internalData"]> = {};
  if (issues !== undefined) internalDataUpdate.issues = issues;
  if (stylePreset !== undefined) internalDataUpdate.stylePreset = stylePreset;
  if (totalCost !== undefined) internalDataUpdate.totalCost = totalCost;
  if (totalTokens !== undefined) internalDataUpdate.totalTokens = totalTokens;
  if (promptTokens !== undefined) internalDataUpdate.promptTokens = promptTokens;
  if (completionTokens !== undefined) internalDataUpdate.completionTokens = completionTokens;
  if (lastModel !== undefined) internalDataUpdate.lastModel = lastModel;
  if (lastAnswer !== undefined) internalDataUpdate.lastAnswer = lastAnswer;

  return {
    ...state,
    ...topLevelFields,
    internalData: {
      ...state.internalData,
      ...internalDataUpdate,
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
  
  // Accumulate prompt and completion tokens separately
  const previousPromptTokens = internalData.promptTokens || 0;
  const previousCompletionTokens = internalData.completionTokens || 0;
  internalData.promptTokens = previousPromptTokens + usage.promptTokens;
  internalData.completionTokens = previousCompletionTokens + usage.completionTokens;
  
  // Calculate totalTokens as sum of prompt + completion for accuracy
  // This ensures we count all tokens even if API returns different total_tokens
  const calculatedTotalTokens = internalData.promptTokens + internalData.completionTokens;
  const apiTotalTokens = usage.totalTokens || 0;
  
  // Use calculated total if it's more accurate, otherwise use API total
  // API total might include other tokens (like system tokens), so we prefer calculated
  internalData.totalTokens = calculatedTotalTokens;
  
  // Debug logging with detailed breakdown
  console.log(`[updateUsageStats] Cost update:`, {
    previousCost,
    usageCost,
    newTotalCost: internalData.totalCost,
    tokens: {
      previousPrompt: previousPromptTokens,
      previousCompletion: previousCompletionTokens,
      newPrompt: usage.promptTokens,
      newCompletion: usage.completionTokens,
      totalPrompt: internalData.promptTokens,
      totalCompletion: internalData.completionTokens,
      calculatedTotal: calculatedTotalTokens,
      apiTotal: apiTotalTokens,
      finalTotal: internalData.totalTokens,
    },
    usage: {
      cost: usage.cost,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
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

/**
 * Get next step from plan (PRO)
 */
export function getNextStepFromPlan(state: AgentState): string | null {
  if (state.plan && state.stepCursor < state.plan.length - 1) {
    return state.plan[state.stepCursor + 1];
  }
  return null;
}

/**
 * Legacy: get next step from hardcoded order
 */
export function getNextStep(currentStep: string): string | null {
  const stepOrder = [
    "mission_interpreter",
    "profile_builder", // PRO: new step
    "party_details_collector", // PRO: new step
    "decision_collector", // PRO: new step
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

