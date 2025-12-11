/**
 * Step 5: Style Planner
 * Selects and describes document style (StylePreset)
 */

import type {
  AgentState,
  LegalDocument,
  AgentStepResult,
  StylePreset,
  ChatMessage,
} from "@/lib/types";
import { updateAgentStateData, updateAgentStateStep } from "../state";

export async function stylePlanner(
  agentState: AgentState,
  document: LegalDocument | null
): Promise<AgentStepResult> {
  const mission = agentState.internalData.mission as
    | { documentType: string; jurisdiction: string; businessContext?: string }
    | undefined;

  if (!mission) {
    throw new Error("Mission not found in agent state");
  }

  // Determine style based on document type and jurisdiction
  const stylePreset: StylePreset = determineStyle(mission);

  // Update state
  const updatedState = updateAgentStateData(agentState, { stylePreset });
  // Don't change step here - let pipeline handle it
  // const updatedStateWithStep = updateAgentStateStep(
  //   updatedState,
  //   "clause_generator"
  // );

  const chatMessage: ChatMessage = {
    id: `msg-${Date.now()}`,
    role: "assistant",
    content: `Выбрал стиль документа: ${stylePreset.family}. Начинаю генерацию текста пунктов...`,
    timestamp: new Date(),
  };

  return {
    type: "continue",
    state: updatedState, // Return state with current step, pipeline will advance it
    chatMessages: [chatMessage],
  };
}

function determineStyle(mission: {
  documentType: string;
  jurisdiction: string;
  businessContext?: string;
}): StylePreset {
  // Default style based on jurisdiction
  let family: StylePreset["family"] = "balanced";
  let formality: StylePreset["formality"] = "medium";
  let sentenceLength: StylePreset["sentenceLength"] = "medium";

  if (mission.jurisdiction === "RU") {
    family = "civil_ru";
    formality = "high";
  } else if (mission.jurisdiction === "US" || mission.jurisdiction === "UK") {
    family = "anglo_saxon";
    formality = "high";
  }

  // Adjust based on document type
  if (mission.documentType === "SaaS_MSA") {
    formality = "high";
    family = "enterprise_legalese";
  }

  // Adjust based on business context
  if (mission.businessContext?.toLowerCase().includes("plain") || 
      mission.businessContext?.toLowerCase().includes("простой")) {
    family = "plain_language";
    formality = "low";
    sentenceLength = "short";
  }

  return {
    id: `style-${Date.now()}`,
    family,
    sentenceLength,
    formality,
    definitionPlacement: family === "anglo_saxon" ? "beginning" : "inline",
    crossReferenceFormat: family === "anglo_saxon" ? "section_name" : "numeric",
  };
}

