/**
 * Step 2: Issue Spotter
 * Identifies legal issues that the document must cover
 */

import type {
  AgentState,
  LegalDocument,
  AgentStepResult,
  Issue,
  UserQuestion,
  ChatMessage,
} from "@/lib/types";
import { getOpenRouterClient } from "@/backend/llm/openrouter";
import { updateAgentStateData, updateAgentStateStep, updateUsageStats } from "../state";

interface IssuesResponse {
  requiredIssues: Array<{
    category: string;
    description: string;
    severity: "low" | "medium" | "high";
  }>;
  optionalIssues: Array<{
    category: string;
    description: string;
    severity: "low" | "medium" | "high";
  }>;
}

export async function issueSpotter(
  agentState: AgentState,
  document: LegalDocument | null
): Promise<AgentStepResult> {
  const mission = agentState.internalData.mission as
    | { documentType: string; jurisdiction: string; userGoals?: string[]; businessContext?: string; riskTolerance?: string }
    | undefined;

  if (!mission) {
    throw new Error("Mission not found in agent state");
  }

  const llm = getOpenRouterClient();

  // Check if we already have issues in state (from previous call)
  let issues: Issue[] = (agentState.internalData.issues as Issue[]) || [];
  
  // If we don't have issues yet, generate them using LLM
  if (issues.length === 0) {
    const systemPrompt = `Ты - эксперт по юридическим документам. Твоя задача - определить юридические вопросы (issues), которые должны быть покрыты в документе.

Верни JSON объект со следующей структурой:
{
  "requiredIssues": [
    {
      "category": "название категории (например: 'Оплата труда', 'Конфиденциальность', 'Срок действия')",
      "description": "краткое описание вопроса",
      "severity": "low" | "medium" | "high"
    }
  ],
  "optionalIssues": [
    {
      "category": "название категории",
      "description": "краткое описание вопроса",
      "severity": "low" | "medium" | "high"
    }
  ]
}

Важно:
- requiredIssues - обязательные вопросы, которые ДОЛЖНЫ быть в документе этого типа
- optionalIssues - опциональные вопросы, которые могут быть включены по желанию
- Используй понятные названия категорий на русском языке
- Учитывай тип документа, юрисдикцию и контекст`;

    const userPrompt = `Определи юридические вопросы для документа:
- Тип документа: ${mission.documentType}
- Юрисдикция: ${mission.jurisdiction}
${mission.businessContext ? `- Контекст: ${mission.businessContext}` : ""}
${mission.userGoals ? `- Цели: ${mission.userGoals.join(", ")}` : ""}
${mission.riskTolerance ? `- Толерантность к риску: ${mission.riskTolerance}` : ""}

Определи обязательные и опциональные вопросы, которые должны быть покрыты в этом документе.`;

    try {
      console.log("[issue_spotter] Calling LLM to generate issues for:", mission.documentType);
      const result = await llm.chatJSON<IssuesResponse>([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ]);
      
      if (result.usage) {
        agentState = updateUsageStats(agentState, result.usage);
      }

      const response = result.data;
      
      // Convert to Issue format
      const requiredIssues: Issue[] = response.requiredIssues.map((issue, idx) => ({
        id: `issue-required-${idx}`,
        category: issue.category,
        description: issue.description,
        severity: issue.severity,
        required: true,
      }));

      const optionalIssues: Issue[] = response.optionalIssues.map((issue, idx) => ({
        id: `issue-optional-${idx}`,
        category: issue.category,
        description: issue.description,
        severity: issue.severity,
        required: false,
      }));

      issues = [...requiredIssues];
      agentState.internalData.optionalIssues = optionalIssues; // Store separately for later use
      
      console.log("[issue_spotter] Generated issues:", {
        required: requiredIssues.length,
        optional: optionalIssues.length,
      });
    } catch (error) {
      console.error("[issue_spotter] Error generating issues:", error);
      throw new Error(`Failed to generate issues: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  // Check if optional issues should be included
  const optionalIssues: Issue[] = (agentState.internalData.optionalIssues as Issue[]) || [];
  const lastAnswer = agentState.internalData.lastAnswer as
    | { selectedOptionIds?: string[] }
    | undefined;
  
  // If we have optional issues and haven't processed them yet
  if (optionalIssues.length > 0) {
    // Check if we only have required issues (haven't added optional yet)
    const hasOnlyRequired = issues.every(issue => issue.required === true);
    
    if (hasOnlyRequired) {
      // If we have an answer, add selected optional issues
      if (lastAnswer?.selectedOptionIds) {
        const selectedIssues = optionalIssues.filter((issue) =>
          lastAnswer.selectedOptionIds?.includes(issue.id)
        );
        issues = [...issues, ...selectedIssues];
      } else {
        // No answer yet, ask the user
        // Save required issues first
        const stateWithRequiredIssues = updateAgentStateData(agentState, { issues });
        
        const question: UserQuestion = {
          id: `question-${Date.now()}`,
          type: "multi_choice",
          title: "Дополнительные модули документа",
          text: `Для ${mission.documentType} можно дополнительно включить следующие модули. Какие из них актуальны для вашего случая?`,
          legalImpact: "Включение дополнительных модулей может усилить защиту ваших интересов, но также может усложнить переговоры с контрагентом.",
          options: optionalIssues.map((issue) => ({
            id: issue.id,
            label: issue.category,
            description: issue.description,
            riskLevel: issue.severity,
          })),
        };

        const chatMessage: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: "assistant",
          content: `Я определил обязательные разделы документа. Теперь нужно решить, какие дополнительные модули включить.`,
          timestamp: new Date(),
        };

        return {
          type: "need_user_input",
          state: stateWithRequiredIssues,
          question,
          chatMessages: [chatMessage],
        };
      }
    }
  }

  // Ensure issues are always saved
  if (issues.length === 0) {
    throw new Error("No issues generated for document");
  }

  console.log("[issue_spotter] Final issues count:", issues.length);
  console.log("[issue_spotter] Issues:", issues.map(i => i.category).join(", "));
  console.log("[issue_spotter] Current state internalData keys:", Object.keys(agentState.internalData));
  
  // Update state with final issues - make sure we preserve all existing data
  const updatedState = updateAgentStateData(agentState, { 
    issues,
    // Preserve mission if it exists
    ...(agentState.internalData.mission ? { mission: agentState.internalData.mission } : {}),
  });
  
  console.log("[issue_spotter] Updated state internalData keys:", Object.keys(updatedState.internalData));
  console.log("[issue_spotter] Issues in updated state:", updatedState.internalData.issues ? "YES" : "NO");
  
  // Don't change step here - let pipeline handle it
  // const updatedStateWithStep = updateAgentStateStep(
  //   updatedState,
  //   "skeleton_generator"
  // );

  // Verify issues are in the state
  if (!updatedState.internalData.issues) {
    console.error("ERROR: Issues not saved in state!", {
      issues,
      issuesLength: issues.length,
      internalData: updatedState.internalData,
      internalDataKeys: Object.keys(updatedState.internalData),
    });
    throw new Error("Failed to save issues in agent state");
  }
  
  console.log("[issue_spotter] State verified, issues saved successfully");

  const chatMessage: ChatMessage = {
    id: `msg-${Date.now()}`,
    role: "assistant",
    content: `Определил ${issues.length} юридических вопросов, которые документ должен покрыть. Создаю структуру документа...`,
    timestamp: new Date(),
  };

  return {
    type: "continue",
    state: updatedState, // Return state with current step, pipeline will advance it
    chatMessages: [chatMessage],
  };
}
