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
  DocumentProfile,
  DecisionsMap,
  LegalDomain,
  LegalBlock,
  DecisionKey,
  PartyRole,
} from "@/lib/types";
import { getOpenRouterClient } from "@/backend/llm/openrouter";
import { updateAgentStateData, updateAgentStateStep } from "../state";

export async function clauseRequirementsGenerator(
  agentState: AgentState,
  document: LegalDocument | null
): Promise<AgentStepResult> {
  const mission = agentState.mission as any;
  const profile = agentState.profile as DocumentProfile | undefined;
  const skeleton = agentState.skeleton as DocumentSkeleton | undefined;
  const issues = agentState.internalData.issues as any[] | undefined;
  const decisions = agentState.decisions; // обязательное поле на верхнем уровне

  if (!mission || !skeleton || !issues) {
    throw new Error("Mission, skeleton, or issues not found in agent state");
  }

  if (!profile) {
    throw new Error("Profile not found in agent state - profile_builder must run first");
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
      // mission и skeleton уже на верхнем уровне согласно archv2.md
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
        required: true,
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

    // PRO: Determine related domains, blocks, decisions, and party roles for this section
    const relatedDomains = determineRelatedDomains(section, profile);
    const relatedBlocks = determineRelatedBlocks(section, profile);
    const relatedDecisions = determineRelatedDecisions(section, profile);
    const relatedPartyRoles = determineRelatedPartyRoles(section, profile);

    // PRO: Check if required decisions are missing - if so, stop and ask user
    const missingDecisions = relatedDecisions.filter(
      (key) => !decisions || !decisions[key]
    );

    if (missingDecisions.length > 0) {
      // Need to collect decisions first - this will be handled by decision_collector step
      // For now, just log it and continue (decision_collector will handle it)
      console.log(`[clause_requirements_generator] Section ${section.title} requires decisions: ${missingDecisions.join(", ")}`);
    }

    // Generate requirement for section
    const requirement: ClauseRequirement = {
      id: `req-${section.id}`,
      sectionId: section.id,
      title: section.title, // PRO: add title
      purpose: `Покрывает вопросы: ${sectionIssues.map((i) => i.category).join(", ")}`,
      relatedIssues: sectionIssues.map((i) => i.id),
      requiredElements: extractRequiredElements(sectionIssues, section),
      recommendedElements: extractRecommendedElements(sectionIssues, section, "medium"), // riskTolerance убран из mission согласно archv2.md
      // PRO: add new fields
      relatedDomains,
      relatedBlocks,
      relatedDecisions: relatedDecisions.length > 0 ? relatedDecisions : undefined,
      relatedPartyRoles: relatedPartyRoles.length > 0 ? relatedPartyRoles : undefined,
      riskNotes: generateRiskNotes(sectionIssues),
    };

    requirements.push(requirement);
  }

  // Update state with requirements (на верхнем уровне согласно archv2.md)
  const updatedState = updateAgentStateData(agentState, {
    clauseRequirements: requirements,
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

// PRO: Helper functions for determining relationships
function determineRelatedDomains(section: any, profile: DocumentProfile): LegalDomain[] {
  const sectionTitle = section.title.toLowerCase();
  const domains: LegalDomain[] = [];

  // Map section titles to domains
  if (sectionTitle.includes("конфиденциальн")) {
    domains.push("confidentiality");
  }
  if (sectionTitle.includes("услуг") || sectionTitle.includes("работ")) {
    domains.push("services");
  }
  if (sectionTitle.includes("интеллектуальн") || sectionTitle.includes("права")) {
    domains.push("ip");
  }
  if (sectionTitle.includes("персональн") || sectionTitle.includes("данн")) {
    domains.push("data_protection_ru");
  }
  if (sectionTitle.includes("оплат") || sectionTitle.includes("стоимость")) {
    domains.push("payment");
  }
  if (sectionTitle.includes("ответственн")) {
    domains.push("liability");
  }
  if (sectionTitle.includes("расторжен")) {
    domains.push("termination");
  }
  if (sectionTitle.includes("спор")) {
    domains.push("dispute_resolution");
  }
  if (sectionTitle.includes("право") || sectionTitle.includes("применим")) {
    domains.push("governing_law");
  }

  // Intersect with profile domains
  return domains.filter((d) => profile.legalDomains.includes(d));
}

function determineRelatedBlocks(section: any, profile: DocumentProfile): LegalBlock[] {
  const sectionTitle = section.title.toLowerCase();
  const blocks: LegalBlock[] = [];

  // Map section titles to blocks
  if (sectionTitle.includes("сторон") || sectionTitle.includes("преамбул")) {
    blocks.push("preamble_parties");
  }
  if (sectionTitle.includes("термин") || sectionTitle.includes("определен")) {
    blocks.push("definitions");
  }
  if (sectionTitle.includes("предмет")) {
    blocks.push("subject_scope");
  }
  if (sectionTitle.includes("приемк") || sectionTitle.includes("результат")) {
    blocks.push("deliverables_acceptance");
  }
  if (sectionTitle.includes("оплат") || sectionTitle.includes("стоимость")) {
    blocks.push("fees_payment");
  }
  if (sectionTitle.includes("конфиденциальн")) {
    blocks.push("confidentiality");
  }
  if (sectionTitle.includes("интеллектуальн")) {
    blocks.push("ip_rights");
  }
  if (sectionTitle.includes("ответственн")) {
    blocks.push("liability_cap_exclusions");
  }
  if (sectionTitle.includes("расторжен")) {
    blocks.push("termination");
  }

  // Intersect with profile blocks
  return blocks.filter((b) => 
    profile.mandatoryBlocks.includes(b) || profile.optionalBlocks.includes(b)
  );
}

function determineRelatedDecisions(section: any, profile: DocumentProfile): DecisionKey[] {
  const sectionTitle = section.title.toLowerCase();
  const decisions: DecisionKey[] = [];

  if (sectionTitle.includes("ответственн")) {
    decisions.push("liability_cap");
  }
  if (sectionTitle.includes("срок") || sectionTitle.includes("действ")) {
    decisions.push("term");
    decisions.push("auto_renewal");
  }
  if (sectionTitle.includes("расторжен")) {
    decisions.push("termination_rights");
  }
  if (sectionTitle.includes("интеллектуальн") && profile.legalDomains.includes("ip")) {
    decisions.push("ip_model");
  }
  if (sectionTitle.includes("персональн") || sectionTitle.includes("данн")) {
    decisions.push("pd_regime_ru");
  }
  if (sectionTitle.includes("обслуживан") || sectionTitle.includes("sla")) {
    decisions.push("sla_level");
  }
  if (sectionTitle.includes("оплат")) {
    decisions.push("payment_terms");
  }
  if (sectionTitle.includes("спор") || sectionTitle.includes("право")) {
    decisions.push("governing_law");
    decisions.push("dispute_resolution");
  }

  return decisions;
}

function determineRelatedPartyRoles(section: any, profile: DocumentProfile): PartyRole[] {
  const sectionTitle = section.title.toLowerCase();
  const roles: PartyRole[] = [];

  // Most sections involve both parties, but some are specific
  if (sectionTitle.includes("оплат") || sectionTitle.includes("стоимость")) {
    roles.push("customer", "vendor");
  }
  if (sectionTitle.includes("услуг") || sectionTitle.includes("работ")) {
    roles.push("vendor", "customer");
  }
  if (sectionTitle.includes("ответственн")) {
    roles.push("vendor", "customer");
  }

  return roles;
}

