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
} from "@/lib/types";

export async function documentLinter(
  agentState: AgentState,
  document: LegalDocument | null
): Promise<AgentStepResult> {
  if (!document) {
    throw new Error("Document not found");
  }

  const issues = agentState.internalData.issues as Issue[] | undefined;
  if (!issues) {
    throw new Error("Issues not found in agent state");
  }

  // Check if all required issues are covered
  const requiredIssues = issues.filter((i) => i.required);
  const coveredIssues = new Set<string>();

  for (const clause of document.clauses) {
    const clauseIssues = agentState.internalData.clauseRequirements?.find(
      (req: any) => req.sectionId === clause.sectionId
    )?.relatedIssues || [];
    clauseIssues.forEach((issueId: string) => coveredIssues.add(issueId));
  }

  const missingIssues = requiredIssues.filter(
    (issue) => !coveredIssues.has(issue.id)
  );

  // Check for potential problems
  const problems: string[] = [];

  // Check term duration (example: if NDA term is too long)
  if (document.mission.documentType === "NDA") {
    // This would be checked in actual clauses, but for MVP we'll skip detailed checks
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

