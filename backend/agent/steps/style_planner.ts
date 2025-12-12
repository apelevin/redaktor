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
  const mission = agentState.mission;
  const profile = agentState.profile;

  if (!mission) {
    throw new Error("Mission not found in agent state");
  }

  // Determine style based on profile and jurisdiction (PRO согласно archv2.md)
  const stylePreset: StylePreset = determineStyle(mission, profile);

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

function determineStyle(
  mission: any,
  profile?: any
): StylePreset {
  // Default style based on jurisdiction
  let family: StylePreset["family"] = "balanced";
  let formality: StylePreset["formality"] = "medium";
  let sentenceLength: StylePreset["sentenceLength"] = "medium";

  const jurisdiction = mission.jurisdiction?.[0] || "RU";
  if (jurisdiction === "RU") {
    family = "civil_ru";
    formality = "high";
  } else if (jurisdiction === "US" || jurisdiction === "UK") {
    family = "anglo_saxon";
    formality = "high";
  }

  // PRO: Используем profile вместо documentType согласно archv2.md
  if (profile?.legalDomains.includes("services") && profile?.legalDomains.includes("sla")) {
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

