/**
 * Step 1: Mission Interpreter
 * Converts raw user input into structured LegalDocumentMission
 */

import type {
  AgentState,
  LegalDocument,
  AgentStepResult,
  LegalDocumentMission,
  UserQuestion,
  ChatMessage,
} from "@/lib/types";
import { getOpenRouterClient } from "@/backend/llm/openrouter";
import { updateAgentStateData, updateAgentStateStep } from "../state";

export async function missionInterpreter(
  userMessage: string,
  agentState: AgentState,
  document: LegalDocument | null
): Promise<AgentStepResult> {
  const llm = getOpenRouterClient();

  // If mission already exists, skip
  if (agentState.internalData.mission) {
    return {
      type: "continue",
      state: updateAgentStateStep(agentState, "issue_spotter"),
      chatMessages: [],
    };
  }

  // Try to extract mission from user message
  const systemPrompt = `Ты - эксперт по юридическим документам. Твоя задача - извлечь структурированную информацию о документе из запроса пользователя.

Верни JSON объект со следующей структурой:
{
  "documentType": "NDA" | "SaaS_MSA" | "SERVICE_AGREEMENT" | "PRIVACY_POLICY" | "OTHER",
  "jurisdiction": "RU" | "US" | "EU" | "UK" | "OTHER",
  "language": "ru" | "en",
  "partyA": "название стороны A или null",
  "partyB": "название стороны B или null",
  "businessContext": "краткое описание контекста или null",
  "userGoals": ["цель1", "цель2"] или [],
  "riskTolerance": "low" | "medium" | "high" или null
}

Если какая-то информация не указана явно, используй null. Для documentType и jurisdiction используй "OTHER" только если действительно не можешь определить.`;

  try {
    const response = await llm.chatJSON<Partial<LegalDocumentMission>>([
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ]);

    // Check if we have enough information
    const missingFields: string[] = [];
    if (!response.documentType || response.documentType === "OTHER") {
      missingFields.push("тип документа");
    }
    if (!response.jurisdiction || response.jurisdiction === "OTHER") {
      missingFields.push("юрисдикция");
    }

    if (missingFields.length > 0) {
      // Need to ask user
      const question: UserQuestion = {
        id: `question-${Date.now()}`,
        type: "single_choice",
        title: "Уточнение информации о документе",
        text: `Для создания документа мне нужна дополнительная информация: ${missingFields.join(", ")}.`,
        legalImpact: "Эта информация влияет на структуру и содержание документа.",
        options: missingFields.map((field, idx) => ({
          id: `option-${idx}`,
          label: field,
          description: `Укажите ${field}`,
        })),
      };

      // For now, create a simple question - in real implementation, this would be more sophisticated
      const chatMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: `Я вижу, что вы хотите создать документ, но мне нужно уточнить: ${missingFields.join(", ")}. Можете ли вы указать эти данные?`,
        timestamp: new Date(),
      };

      return {
        type: "need_user_input",
        state: agentState,
        question,
        chatMessages: [chatMessage],
      };
    }

    // Create mission
    const mission: LegalDocumentMission = {
      documentType: response.documentType!,
      jurisdiction: response.jurisdiction!,
      language: response.language || "ru",
      partyA: response.partyA || undefined,
      partyB: response.partyB || undefined,
      businessContext: response.businessContext || undefined,
      userGoals: response.userGoals || [],
      riskTolerance: response.riskTolerance || "medium",
    };

    const updatedState = updateAgentStateData(agentState, { mission });
    const updatedStateWithStep = updateAgentStateStep(
      updatedState,
      "issue_spotter"
    );

    const chatMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: `Понял! Создаю ${mission.documentType} для юрисдикции ${mission.jurisdiction}. Начинаю анализ требований...`,
      timestamp: new Date(),
    };

    return {
      type: "continue",
      state: updatedStateWithStep,
      chatMessages: [chatMessage],
    };
  } catch (error) {
    const errorMessage: ChatMessage = {
      id: `error-${Date.now()}`,
      role: "assistant",
      content: `Произошла ошибка при анализе запроса: ${
        error instanceof Error ? error.message : "Неизвестная ошибка"
      }`,
      timestamp: new Date(),
    };

    return {
      type: "continue",
      state: agentState,
      chatMessages: [errorMessage],
    };
  }
}

