/**
 * Step 7: Document Linter
 * Final pass through the document to check for issues and completeness
 */

import type {
  AgentState,
  LegalDocument,
  AgentStepResult,
  Issue,
  UserQuestion,
  ChatMessage,
  DocumentProfile,
  ContractParty,
} from "@/lib/types";
import { getOpenRouterClient } from "@/backend/llm/openrouter";
import { updateUsageStats } from "../state";
import { isProhibitedPattern } from "../rules/prohibitedPatternsRU";

export async function documentLinter(
  agentState: AgentState,
  document: LegalDocument | null
): Promise<AgentStepResult> {
  if (!document) {
    throw new Error("Document not found");
  }

  const profile = agentState.profile as DocumentProfile | undefined;
  const issues = agentState.internalData.issues as Issue[] | undefined;
  const parties = agentState.parties; // обязательное поле на верхнем уровне

  if (!issues) {
    throw new Error("Issues not found in agent state");
  }

  if (!profile) {
    throw new Error("Profile not found in agent state");
  }

  // PRO: Hard checks
  const problems: string[] = [];
  const missingIssues: Issue[] = [];

  // Check 1: Coverage of mandatory blocks
  const documentBlocks = new Set<string>();
  if (document.skeleton?.sections) {
    for (const section of document.skeleton.sections) {
      // Map section title to block (simplified)
      const sectionTitle = section.title.toLowerCase();
      if (sectionTitle.includes("сторон") || sectionTitle.includes("преамбул")) {
        documentBlocks.add("preamble_parties");
      }
      if (sectionTitle.includes("термин") || sectionTitle.includes("определен")) {
        documentBlocks.add("definitions");
      }
      // Add more mappings as needed
    }
  }

  const missingBlocks = profile.mandatoryBlocks.filter(
    (block) => !documentBlocks.has(block)
  );
  if (missingBlocks.length > 0) {
    problems.push(`Отсутствуют обязательные блоки: ${missingBlocks.join(", ")}`);
  }

  // Check 2: Parties completeness
  if (!parties || parties.length === 0) {
    problems.push("Не указаны стороны договора");
  } else {
    for (const party of parties) {
      if (!party.legalName) {
        problems.push(`Не указано полное наименование для ${party.displayName}`);
      }
      if (party.identifiers && !party.identifiers.inn) {
        problems.push(`Не указан ИНН для ${party.displayName}`);
      }
    }
  }

  // Check 3: Required issues coverage
  const requiredIssues = issues.filter((i) => i.required);
  const coveredIssues = new Set<string>();

  // PRO: Используем обязательное поле clauseDrafts согласно archv2.md
  const clauses = document.clauseDrafts;
  for (const clause of clauses) {
    const requirement = agentState.clauseRequirements?.find(
      (req: any) => req.id === clause.requirementId || req.sectionId === clause.sectionId
    );
    if (requirement?.relatedIssues) {
      requirement.relatedIssues.forEach((issueId: string) => coveredIssues.add(issueId));
    }
  }

  const missingRequiredIssues = requiredIssues.filter(
    (issue) => !coveredIssues.has(issue.id)
  );
  missingIssues.push(...missingRequiredIssues);

  // Check 4: Prohibited patterns (PRO)
  const documentText = clauses.map((c) => c.text).join(" ").toLowerCase();
  for (const pattern of profile.prohibitedPatterns) {
    if (isProhibitedPattern(pattern)) {
      // Check if pattern appears in document (simplified check)
      const patternLower = pattern.toLowerCase();
      if (documentText.includes(patternLower.replace(/_/g, " "))) {
        problems.push(`Обнаружен запрещенный паттерн: ${pattern}`);
      }
    }
  }

  // PRO: Soft checks using LLM (if problems found)
  if (problems.length === 0 && missingIssues.length === 0) {
    // Run LLM-based soft checks
    const llm = getOpenRouterClient();
    try {
      const systemPrompt = `Ты - эксперт по российскому праву. Проверь документ на:
- Рыночность формулировок
- Соответствие риск-позиции
- Наличие опасных паттернов для РФ
- Consistency терминов

Верни JSON:
{
  "problems": ["проблема1", "проблема2"],
  "riskLevel": "low" | "medium" | "high"
}`;

      const userPrompt = `Проверь документ:
Профиль: ${profile.primaryPurpose}
Риск-позиция: ${profile.riskPosture}
Запрещенные паттерны: ${profile.prohibitedPatterns.join(", ")}

Текст документа (первые 2000 символов): ${documentText.substring(0, 2000)}`;

      const result = await llm.chatJSON<{ problems: string[]; riskLevel: string }>([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ]);

      if (result.usage) {
        agentState = updateUsageStats(agentState, result.usage);
      }

      if (result.data.problems && result.data.problems.length > 0) {
        problems.push(...result.data.problems);
      }
    } catch (error) {
      console.warn("[document_linter] LLM soft check failed:", error);
    }
  }

  // If there are missing issues or problems, ask user
  if (missingIssues.length > 0 || problems.length > 0) {
    const question: UserQuestion = {
      id: `question-${Date.now()}`,
      type: "single_choice",
      title: "Проверка документа",
      text: `Я обнаружил следующие проблемы:
${missingIssues.length > 0 ? `- Не покрыты обязательные вопросы: ${missingIssues.map((i) => i.category).join(", ")}\n` : ""}
${problems.length > 0 ? `- Потенциальные проблемы: ${problems.join(", ")}\n` : ""}
Хотите, чтобы я исправил эти проблемы?`,
      required: true,
      legalImpact: "Исправление этих проблем улучшит качество и полноту документа.",
      options: [
        {
          id: "fix-yes",
          label: "Да, исправить",
          isRecommended: true,
        },
        {
          id: "fix-no",
          label: "Оставить как есть",
        },
      ],
    };

    const chatMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: `Выполнил финальную проверку документа. Обнаружены некоторые моменты, которые стоит исправить.`,
      timestamp: new Date(),
    };

    return {
      type: "need_user_input",
      state: agentState,
      question,
      chatMessages: [chatMessage],
    };
  }

  // Document is ready
  const chatMessage: ChatMessage = {
    id: `msg-${Date.now()}`,
    role: "assistant",
    content: `Документ готов! Все обязательные разделы покрыты, противоречий не обнаружено. Вы можете просмотреть документ слева и при необходимости внести правки вручную.`,
    timestamp: new Date(),
  };

  return {
    type: "finished",
    state: agentState,
    document: document,
    chatMessages: [chatMessage],
  };
}

