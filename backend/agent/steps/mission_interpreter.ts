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
  ReasoningLevel,
  DecisionRecord,
} from "@/lib/types";
import { getOpenRouterClient } from "@/backend/llm/openrouter";
import { updateAgentStateData, updateAgentStateStep, updateUsageStats } from "../state";

export async function missionInterpreter(
  userMessage: string,
  agentState: AgentState,
  document: LegalDocument | null
): Promise<AgentStepResult> {
  const llm = getOpenRouterClient();

  // If mission already exists, check if reasoningLevel is set
  const existingMission = agentState.mission as LegalDocumentMission | undefined;
  if (existingMission) {
    // If reasoningLevel is not set, ask for it
    if (!existingMission.reasoningLevel) {
      const question: UserQuestion = {
        id: `question-reasoning-level-${Date.now()}`,
        type: "single_choice",
        title: "Уровень детализации документа",
        text: "Выберите уровень детализации документа. Это определит его размер и глубину проработки.",
        required: true,
        legalImpact: "Уровень детализации влияет на объем документа, количество разделов и глубину проработки юридических вопросов.",
        options: [
          {
            id: "basic",
            label: "Базовый (1-2 страницы)",
            description: "Минимум необходимых положений, краткая форма",
            riskLevel: "low",
            isRecommended: false,
          },
          {
            id: "standard",
            label: "Стандартный (3-5 страниц)",
            description: "Рыночный уровень, стандартные защиты",
            riskLevel: "low",
            isRecommended: true,
            isMarketStandard: true,
          },
          {
            id: "professional",
            label: "Профессиональный (6+ страниц)",
            description: "Максимальная детализация, все edge-cases, расширенные защиты",
            riskLevel: "low",
            isRecommended: false,
          },
        ],
      };

      const chatMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: "Выберите уровень детализации документа.",
        timestamp: new Date(),
      };

      return {
        type: "need_user_input",
        state: agentState,
        question,
        chatMessages: [chatMessage],
      };
    }
    // Mission exists and reasoningLevel is set, skip
    return {
      type: "continue",
      state: agentState,
      chatMessages: [],
    };
  }

  // PRO: Получаем reasoningLevel с приоритетом (согласно reasoning.md):
  // 1. Из decisions (если уже был выбран в UI)
  // 2. Из lastAnswer (fallback для HITL)
  // 3. Если нет - запрашиваем через HITL
  const lastAnswer = agentState.internalData.lastAnswer as any;
  let reasoningLevel: ReasoningLevel | undefined;
  
  // Приоритет 1: из decisions (уже выбран в UI)
  if (agentState.decisions?.reasoning_level?.value) {
    reasoningLevel = agentState.decisions.reasoning_level.value as ReasoningLevel;
    console.log("[mission_interpreter] Using reasoningLevel from decisions:", reasoningLevel);
  }
  // Приоритет 2: из lastAnswer (fallback для HITL)
  else if (lastAnswer && lastAnswer.selectedOptionIds?.[0]) {
    const selectedOption = lastAnswer.selectedOptionIds[0];
    if (selectedOption === "basic" || selectedOption === "standard" || selectedOption === "professional") {
      reasoningLevel = selectedOption as ReasoningLevel;
      console.log("[mission_interpreter] User selected reasoningLevel from HITL:", reasoningLevel);
      
      // Сохраняем в decisions согласно reasoning.md
      agentState.decisions = {
        ...agentState.decisions,
        reasoning_level: {
          key: "reasoning_level",
          value: reasoningLevel,
          source: "user",
          timestamp: new Date().toISOString(),
        },
      };
      
      // Обновляем sizePolicy
      const { getSizePolicy } = await import("@/backend/agent/rules/sizePolicy");
      agentState.sizePolicy = getSizePolicy(reasoningLevel);
    }
  }

  // Check if we have a user answer with freeText (for missing fields)
  let inputMessage = userMessage;
  if (lastAnswer && lastAnswer.freeText) {
    inputMessage = `${userMessage || ""}\n\nДополнительная информация от пользователя:\n${lastAnswer.freeText}`;
    console.log("[mission_interpreter] Using answer from question:", lastAnswer.freeText);
  }

  // PRO: Extract mission information (without documentType - that's profile_builder's job)
  const systemPrompt = `Ты - эксперт по юридическим документам. Твоя задача - извлечь структурированную информацию о документе из запроса пользователя.

Верни JSON объект со следующей структурой:
{
  "jurisdiction": ["RU"] или ["US"] или ["RU", "US"] и т.д. (массив),
  "language": "ru" | "en" | "dual",
  "businessContext": "краткое описание контекста или null",
  "userGoals": ["цель1", "цель2"] или [],
  "riskTolerance": "low" | "medium" | "high" или null,
  "partyNames": ["название стороны 1", "название стороны 2"] или []
}

Важно: 
- jurisdiction должен быть массивом (например ["RU"])
- Если юрисдикция не указана, используй ["RU"] по умолчанию
- businessContext должен содержать описание бизнес-контекста и цели документа
- userGoals - массив конкретных целей пользователя
- НЕ определяй тип документа (documentType) - это будет сделано позже`;

  try {
    console.log("[mission_interpreter] Calling LLM with message:", inputMessage);
    
    const result = await llm.chatJSON<Partial<LegalDocumentMission>>([
      { role: "system", content: systemPrompt },
      { role: "user", content: inputMessage },
    ]);
    const response = result.data;
    
    // Update usage statistics
    if (result.usage) {
      agentState = updateUsageStats(agentState, result.usage);
    }
    console.log("[mission_interpreter] LLM response:", JSON.stringify(response, null, 2));

    // Check if we have enough information
    const missingFields: string[] = [];
    if (!response.jurisdiction || response.jurisdiction.length === 0) {
      missingFields.push("юрисдикция");
    }

    if (missingFields.length > 0) {
      // Need to ask user - create options with text input fields
      const question: UserQuestion = {
        id: `question-${Date.now()}`,
        type: missingFields.length === 1 ? "single_choice" : "multi_choice",
        title: "Уточнение информации о документе",
        text: `Для создания документа мне нужна дополнительная информация: ${missingFields.join(", ")}.`,
        required: true,
        legalImpact: "Эта информация влияет на структуру и содержание документа.",
        options: missingFields.map((field, idx) => {
          const fieldId = field.toLowerCase().replace(/\s+/g, "_");
          return {
            id: `option-${fieldId}`,
            label: field,
            description: `Укажите ${field}`,
            requiresInput: true,
            inputPlaceholder: field === "юрисдикция"
              ? "Например: RU, US, EU, UK"
              : `Введите ${field}`,
          };
        }),
      };

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

    // PRO: Используем reasoningLevel из decisions или default согласно reasoning.md
    const finalReasoningLevel = reasoningLevel || "standard";
    
    // Обновляем sizePolicy если reasoningLevel был установлен
    if (reasoningLevel) {
      const { getSizePolicy } = await import("@/backend/agent/rules/sizePolicy");
      agentState.sizePolicy = getSizePolicy(reasoningLevel);
    }
    
    // PRO: Create mission without documentType (that's profile_builder's job)
    const mission: LegalDocumentMission = {
      rawUserInput: userMessage, // PRO: сохраняем исходный запрос
      jurisdiction: response.jurisdiction || ["RU"],
      language: (response.language as "ru" | "en" | "dual") || "ru",
      parties: [], // PRO: будет заполнено party_details_collector
      businessContext: response.businessContext || userMessage,
      userGoals: response.userGoals || [],
      reasoningLevel: finalReasoningLevel, // PRO: уровень рассуждения
      stylePresetId: "default",
    };
    
    // PRO: Сохраняем reasoningLevel в decisions если еще не сохранен (согласно reasoning.md строки 94-99)
    if (!agentState.decisions?.reasoning_level) {
      agentState.decisions = {
        ...agentState.decisions,
        reasoning_level: {
          key: "reasoning_level",
          value: finalReasoningLevel,
          source: reasoningLevel ? "user" : "default",
          timestamp: new Date().toISOString(),
        },
      };
    }

    console.log("[mission_interpreter] Created mission:", JSON.stringify(mission, null, 2));
    
    // Обновляем mission на верхнем уровне согласно archv2.md
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
      content: `Понял! Создаю документ для юрисдикции ${mission.jurisdiction.join(", ")}. Уровень детализации: ${mission.reasoningLevel}. Начинаю построение профиля документа...`,
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

