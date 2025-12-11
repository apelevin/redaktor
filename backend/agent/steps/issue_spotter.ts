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

  // Check if we already have issues in state (from previous call)
  let issues: Issue[] = (agentState.internalData.issues as Issue[]) || [];
  
  // If we don't have issues yet, start with required ones
  if (issues.length === 0) {
    issues = [...checklist.requiredIssues];
  }

  // Check if optional issues should be included
  const optionalIssues = checklist.optionalIssues;
  const lastAnswer = agentState.internalData.lastAnswer as
    | { selectedOptionIds?: string[] }
    | undefined;
  
  // If we have optional issues and haven't processed them yet
  if (optionalIssues.length > 0) {
    // Check if we only have required issues (haven't added optional yet)
    const hasOnlyRequired = issues.length === checklist.requiredIssues.length &&
      issues.every(issue => checklist.requiredIssues.some(req => req.id === issue.id));
    
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
    issues = [...checklist.requiredIssues];
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
