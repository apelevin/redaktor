/**
 * Step 4: Clause Requirements Generator
 * Generates requirements for each clause based on issues and skeleton
 */

import type {
  AgentState,
  LegalDocument,
  AgentStepResult,
  ClauseRequirement,
  DocumentSkeleton,
  UserQuestion,
  ChatMessage,
} from "@/lib/types";
import { getOpenRouterClient } from "@/backend/llm/openrouter";
import { updateAgentStateData, updateAgentStateStep } from "../state";

export async function clauseRequirementsGenerator(
  agentState: AgentState,
  document: LegalDocument | null
): Promise<AgentStepResult> {
  const mission = agentState.internalData.mission as
    | { documentType: string; riskTolerance?: string }
    | undefined;
  const skeleton = agentState.internalData.skeleton as DocumentSkeleton | undefined;
  const issues = agentState.internalData.issues as any[] | undefined;

  if (!mission || !skeleton || !issues) {
    throw new Error("Mission, skeleton, or issues not found in agent state");
  }

  // First, check if we have an answer about liability cap and process it
  const lastAnswer = agentState.internalData.lastAnswer as
    | { selectedOptionIds?: string[]; questionId?: string }
    | undefined;

  console.log(`[clause_requirements_generator] Checking for liability cap answer. lastAnswer:`, lastAnswer ? "exists" : "none");
  console.log(`[clause_requirements_generator] liabilityCapDecided:`, agentState.internalData.liabilityCapDecided);

  // Process liability cap answer if we have one
  if (lastAnswer?.selectedOptionIds?.[0] && !agentState.internalData.liabilityCapDecided) {
    const capChoice = lastAnswer.selectedOptionIds[0];
    console.log(`[clause_requirements_generator] Processing liability cap answer: ${capChoice}`);
    // Update state immediately with the answer
    agentState = updateAgentStateData(agentState, {
      liabilityCap: capChoice,
      liabilityCapDecided: true,
      // Preserve existing data
      ...(agentState.internalData.mission ? { mission: agentState.internalData.mission } : {}),
      ...(agentState.internalData.issues ? { issues: agentState.internalData.issues } : {}),
      ...(agentState.internalData.skeleton ? { skeleton: agentState.internalData.skeleton } : {}),
    });
    console.log(`[clause_requirements_generator] Updated state, liabilityCapDecided: ${agentState.internalData.liabilityCapDecided}`);
  }

  // Generate requirements for each section
  const requirements: ClauseRequirement[] = [];
  
  for (const section of skeleton.sections) {
    const sectionIssues = issues.filter((issue) =>
      isIssueRelevantToSection(issue, section)
    );

    // For liability section, ask about cap if not already set
    if (
      section.title.toLowerCase().includes("ответственн") &&
      !agentState.internalData.liabilityCapDecided
    ) {
      const question: UserQuestion = {
        id: `question-${Date.now()}`,
        type: "single_choice",
        title: "Ограничение ответственности",
        text: "Сейчас я предлагаю ограничить ответственность поставщика суммой платежей за 12 месяцев. Это стандартная позиция для enterprise SaaS. Вас устроит такой cap?",
        legalImpact: "Ограничение ответственности защищает от крупных исков, но слишком низкий cap может быть неприемлем для контрагента.",
        relatesToSectionId: section.id,
        options: [
          {
            id: "cap-12",
            label: "12 месяцев (рекомендуется)",
            description: "Стандартная позиция для enterprise SaaS",
            isRecommended: true,
            riskLevel: "low",
          },
          {
            id: "cap-6",
            label: "6 месяцев",
            description: "Более агрессивная позиция",
            riskLevel: "medium",
          },
          {
            id: "cap-24",
            label: "24 месяца",
            description: "Более мягкая позиция",
            riskLevel: "low",
          },
          {
            id: "cap-none",
            label: "Без ограничения",
            description: "Высокий риск",
            riskLevel: "high",
          },
        ],
      };

      const chatMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: `Для раздела "${section.title}" нужно определить ограничение ответственности.`,
        timestamp: new Date(),
      };

      return {
        type: "need_user_input",
        state: agentState,
        question,
        chatMessages: [chatMessage],
      };
    }

    // Generate requirement for section
    const requirement: ClauseRequirement = {
      id: `req-${section.id}`,
      sectionId: section.id,
      purpose: `Покрывает вопросы: ${sectionIssues.map((i) => i.category).join(", ")}`,
      relatedIssues: sectionIssues.map((i) => i.id),
      requiredElements: extractRequiredElements(sectionIssues, section),
      recommendedElements: extractRecommendedElements(sectionIssues, section, mission.riskTolerance),
      riskNotes: generateRiskNotes(sectionIssues),
    };

    requirements.push(requirement);
  }

  // Update state with requirements and preserve liability cap decision
  const updatedState = updateAgentStateData(agentState, {
    clauseRequirements: requirements,
    // Preserve liabilityCapDecided if it was set
    ...(agentState.internalData.liabilityCapDecided ? {
      liabilityCapDecided: true,
      liabilityCap: agentState.internalData.liabilityCap,
    } : {}),
  });
  
  console.log(`[clause_requirements_generator] Updated state, liabilityCapDecided: ${updatedState.internalData.liabilityCapDecided}`);
  // Don't change step here - let pipeline handle it
  // const updatedStateWithStep = updateAgentStateStep(
  //   updatedState,
  //   "style_planner"
  // );

  const chatMessage: ChatMessage = {
    id: `msg-${Date.now()}`,
    role: "assistant",
    content: `Определил требования для ${requirements.length} разделов. Выбираю стиль документа...`,
    timestamp: new Date(),
  };

    return {
      type: "continue",
      state: updatedState, // Return state with current step, pipeline will advance it
      chatMessages: [chatMessage],
    };
}

function isIssueRelevantToSection(issue: any, section: any): boolean {
  const sectionTitle = section.title.toLowerCase();
  const issueCategory = issue.category.toLowerCase();

  // Simple matching logic
  if (issueCategory.includes("confidential") && sectionTitle.includes("конфиденциальн")) {
    return true;
  }
  if (issueCategory.includes("liability") && sectionTitle.includes("ответственн")) {
    return true;
  }
  if (issueCategory.includes("ip") && sectionTitle.includes("интеллектуальн")) {
    return true;
  }
  if (issueCategory.includes("sla") && sectionTitle.includes("обслуживан")) {
    return true;
  }
  if (issueCategory.includes("term") && sectionTitle.includes("срок")) {
    return true;
  }
  if (issueCategory.includes("termination") && sectionTitle.includes("расторжен")) {
    return true;
  }
  if (issueCategory.includes("dispute") && sectionTitle.includes("спор")) {
    return true;
  }

  return false;
}

function extractRequiredElements(issues: any[], section: any): string[] {
  const elements: string[] = [];

  if (section.title.toLowerCase().includes("ответственн")) {
    elements.push("cap");
    elements.push("carve-outs");
  }
  if (section.title.toLowerCase().includes("конфиденциальн")) {
    elements.push("definition");
    elements.push("obligations");
    elements.push("exceptions");
  }
  if (section.title.toLowerCase().includes("срок")) {
    elements.push("duration");
    elements.push("renewal");
  }

  return elements;
}

function extractRecommendedElements(
  issues: any[],
  section: any,
  riskTolerance?: string
): string[] {
  const elements: string[] = [];

  if (riskTolerance === "low" || !riskTolerance) {
    if (section.title.toLowerCase().includes("ответственн")) {
      elements.push("exclusions");
      elements.push("indemnification");
    }
  }

  return elements;
}

function generateRiskNotes(issues: any[]): string | undefined {
  const highRiskIssues = issues.filter((i) => i.severity === "high");
  if (highRiskIssues.length > 0) {
    return `Высокий риск по вопросам: ${highRiskIssues.map((i) => i.category).join(", ")}`;
  }
  return undefined;
}

