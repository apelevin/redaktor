/**
 * Agent State Management
 * Utilities for managing AgentState
 */

import type { AgentState } from "@/lib/types";

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

