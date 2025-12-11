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
    // Don't change step here - let pipeline handle it
    return {
      type: "continue",
      state: agentState, // Return state with current step, pipeline will advance it
      chatMessages: [],
    };
  }

  // Try to extract mission from user message
  const systemPrompt = `Ты - эксперт по юридическим документам. Твоя задача - извлечь структурированную информацию о документе из запроса пользователя.

Верни JSON объект со следующей структурой:
{
  "documentType": "название типа документа на русском языке (например: 'трудовой договор', 'договор оказания услуг', 'NDA', 'договор подряда', 'лицензионное соглашение' и т.д.)",
  "jurisdiction": "RU" | "US" | "EU" | "UK" | "OTHER",
  "language": "ru" | "en",
  "partyA": "название стороны A или null",
  "partyB": "название стороны B или null",
  "businessContext": "краткое описание контекста или null",
  "userGoals": ["цель1", "цель2"] или [],
  "riskTolerance": "low" | "medium" | "high" или null
}

Важно: 
- documentType должен быть понятным названием типа документа на русском языке (например: "трудовой договор", "договор оказания услуг", "договор подряда", "лицензионное соглашение", "NDA", "договор аренды" и т.д.)
- Используй точное и понятное название, которое отражает суть документа
- Если какая-то информация не указана явно, используй null. Для jurisdiction используй "OTHER" только если действительно не можешь определить.`;

  try {
    console.log("[mission_interpreter] Calling LLM with message:", userMessage);
    
    // Initialize cost tracking if not exists
    if (!agentState.internalData.totalCost) {
      agentState.internalData.totalCost = 0;
    }
    if (!agentState.internalData.totalTokens) {
      agentState.internalData.totalTokens = 0;
    }
    
    const result = await llm.chatJSON<Partial<LegalDocumentMission>>([
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ]);
    const response = result.data;
    if (result.usage) {
      // Store usage in agent state
      agentState.internalData.totalCost = (agentState.internalData.totalCost || 0) + (result.usage.cost || 0);
      agentState.internalData.totalTokens = (agentState.internalData.totalTokens || 0) + result.usage.totalTokens;
    }
    console.log("[mission_interpreter] LLM response:", JSON.stringify(response, null, 2));

    // Check if we have enough information
    const missingFields: string[] = [];
    if (!response.documentType || response.documentType.trim() === "") {
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

    console.log("[mission_interpreter] Created mission:", JSON.stringify(mission, null, 2));
    
    const updatedState = updateAgentStateData(agentState, { mission });
    console.log("[mission_interpreter] Updated state internalData keys:", Object.keys(updatedState.internalData));
    
    // Don't change step here - let pipeline handle it
    // const updatedStateWithStep = updateAgentStateStep(
    //   updatedState,
    //   "issue_spotter"
    // );

    const chatMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: `Понял! Создаю ${mission.documentType} для юрисдикции ${mission.jurisdiction}. Начинаю анализ требований...`,
      timestamp: new Date(),
    };

    return {
      type: "continue",
      state: updatedState, // Return state with current step, pipeline will advance it
      chatMessages: [chatMessage],
    };
  } catch (error) {
    console.error("[mission_interpreter] Error:", error);
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

