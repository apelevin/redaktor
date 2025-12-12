/**
 * Step 2: Profile Builder (PRO)
 * Builds DocumentProfile from mission context using rule engine and LLM
 */

import type {
  AgentState,
  LegalDocument,
  AgentStepResult,
  DocumentProfile,
  LegalDocumentMission,
  UserQuestion,
  ChatMessage,
} from "@/lib/types";
import { getOpenRouterClient } from "@/backend/llm/openrouter";
import { updateAgentStateData, updateUsageStats } from "../state";
import { applyProfileRules, requiresUserDecision } from "../rules/profileRulesRU";
import { getSizePolicy } from "../rules/sizePolicy";

export async function profileBuilder(
  agentState: AgentState,
  document: LegalDocument | null
): Promise<AgentStepResult> {
  const llm = getOpenRouterClient();
  const mission = agentState.mission as LegalDocumentMission | undefined;

  if (!mission) {
    throw new Error("Mission not found in agent state");
  }

  // Get reasoning level and size policy
  const reasoningLevel = mission.reasoningLevel || "standard";
  const sizePolicy = getSizePolicy(reasoningLevel);

  // Apply rule engine to get initial profile
  const profileDraft: Partial<DocumentProfile> = {
    primaryPurpose: mission.businessContext || "юридический документ",
    riskPosture: "balanced", // По умолчанию balanced (riskTolerance убран из mission согласно archv2.md)
  };

  let profile = applyProfileRules(mission, profileDraft);

  // Use LLM to refine profile if there are ambiguities
  const systemPrompt = `Ты - эксперт по российскому праву. Твоя задача - определить юридический профиль документа на основе контекста.

Контекст:
- Цель: ${mission.businessContext || "не указана"}
- Цели пользователя: ${mission.userGoals?.join(", ") || "не указаны"}
- Юрисдикция: ${mission.jurisdiction?.join(", ") || "RU"}

Верни JSON объект со следующей структурой:
{
  "primaryPurpose": "краткое описание назначения документа",
  "legalDomains": ["список доменов права"],
  "mandatoryBlocks": ["обязательные блоки"],
  "optionalBlocks": ["опциональные блоки (в зависимости от уровня)"],
  "prohibitedPatterns": ["запрещенные паттерны для РФ"],
  "marketArchetype": "рыночный архетип документа"
}

Важно:
- Учитывай российское законодательство
- Избегай запрещенных паттернов для РФ
- Определи все релевантные правовые домены`;

  try {
    console.log("[profile_builder] Calling LLM to refine profile");
    const result = await llm.chatJSON<Partial<DocumentProfile>>([
      { role: "system", content: systemPrompt },
      { role: "user", content: `Определи профиль документа на основе контекста: ${mission.businessContext}` },
    ]);

    if (result.usage) {
      agentState = updateUsageStats(agentState, result.usage);
    }

    const llmProfile = result.data;

    // Merge LLM profile with rule-based profile
    profile = {
      primaryPurpose: llmProfile.primaryPurpose || profile.primaryPurpose,
      legalDomains: [
        ...new Set([
          ...profile.legalDomains,
          ...(llmProfile.legalDomains || []),
        ]),
      ],
      mandatoryBlocks: [
        ...new Set([
          ...profile.mandatoryBlocks,
          ...(llmProfile.mandatoryBlocks || []),
        ]),
      ],
      optionalBlocks: [
        ...new Set([
          ...profile.optionalBlocks,
          ...(llmProfile.optionalBlocks || []),
        ]),
      ],
      prohibitedPatterns: [
        ...new Set([
          ...profile.prohibitedPatterns,
          ...(llmProfile.prohibitedPatterns || []),
        ]),
      ],
      marketArchetype: llmProfile.marketArchetype || profile.marketArchetype,
      riskPosture: profile.riskPosture,
    };

    console.log("[profile_builder] Built profile:", {
      primaryPurpose: profile.primaryPurpose,
      legalDomains: profile.legalDomains.length,
      mandatoryBlocks: profile.mandatoryBlocks.length,
      optionalBlocks: profile.optionalBlocks.length,
    });

    // Check if user decision is required
    const decisionCheck = requiresUserDecision(profile);
    if (decisionCheck.requiresDecision && decisionCheck.decisionKey) {
      // This will be handled by decision_collector step
      // For now, just log it
      console.log(`[profile_builder] Profile requires decision: ${decisionCheck.decisionKey}`);
    }

    // Update state with profile and size policy (на верхнем уровне согласно archv2.md)
    const updatedState = updateAgentStateData(agentState, {
      profile,
      sizePolicy,
    });

    const chatMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: `Определил профиль документа: ${profile.primaryPurpose}. Покрываю ${profile.legalDomains.length} правовых доменов.`,
      timestamp: new Date(),
    };

    return {
      type: "continue",
      state: updatedState,
      chatMessages: [chatMessage],
    };
  } catch (error) {
    console.error("[profile_builder] Error:", error);
    
    // Fallback to rule-based profile only
    const updatedState = updateAgentStateData(agentState, {
      profile,
      sizePolicy,
    });

    const chatMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: `Определил базовый профиль документа на основе правил.`,
      timestamp: new Date(),
    };

    return {
      type: "continue",
      state: updatedState,
      chatMessages: [chatMessage],
    };
  }
}
