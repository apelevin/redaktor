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
import { getChecklist } from "@/backend/tools/checklists";
import { getOpenRouterClient } from "@/backend/llm/openrouter";
import { updateAgentStateData, updateAgentStateStep } from "../state";

export async function issueSpotter(
  agentState: AgentState,
  document: LegalDocument | null
): Promise<AgentStepResult> {
  const mission = agentState.internalData.mission as
    | { documentType: string; jurisdiction: string; userGoals?: string[] }
    | undefined;

  if (!mission) {
    throw new Error("Mission not found in agent state");
  }

  // Get base checklist
  const checklist = getChecklist(mission.documentType);
  if (!checklist) {
    throw new Error(`No checklist found for document type: ${mission.documentType}`);
  }

  // Start with required issues
  let issues: Issue[] = [...checklist.requiredIssues];

  // Check if optional issues should be included
  const optionalIssues = checklist.optionalIssues;
  
  // For MVP, we'll ask about optional issues if there are any
  if (optionalIssues.length > 0 && !agentState.internalData.issues) {
    // Ask user about optional issues
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
      state: agentState,
      question,
      chatMessages: [chatMessage],
    };
  }

  // If we have an answer about optional issues, process it
  const lastAnswer = agentState.internalData.lastAnswer as
    | { selectedOptionIds?: string[] }
    | undefined;

  if (lastAnswer?.selectedOptionIds) {
    // Add selected optional issues
    const selectedIssues = optionalIssues.filter((issue) =>
      lastAnswer.selectedOptionIds?.includes(issue.id)
    );
    issues = [...issues, ...selectedIssues];
  }

  // Update state with issues
  const updatedState = updateAgentStateData(agentState, { issues });
  const updatedStateWithStep = updateAgentStateStep(
    updatedState,
    "skeleton_generator"
  );

  const chatMessage: ChatMessage = {
    id: `msg-${Date.now()}`,
    role: "assistant",
    content: `Определил ${issues.length} юридических вопросов, которые документ должен покрыть. Создаю структуру документа...`,
    timestamp: new Date(),
  };

  return {
    type: "continue",
    state: updatedStateWithStep,
    chatMessages: [chatMessage],
  };
}

