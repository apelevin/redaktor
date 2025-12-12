/**
 * Step 4: Decision Collector (PRO)
 * Collects critical user decisions that affect document structure and content
 */

import type {
  AgentState,
  LegalDocument,
  AgentStepResult,
  DecisionKey,
  DecisionsMap,
  UserQuestion,
  ChatMessage,
  DocumentProfile,
  ClauseRequirement,
  UserAnswer,
} from "@/lib/types";
import { updateAgentStateData } from "../state";

export async function decisionCollector(
  agentState: AgentState,
  document: LegalDocument | null
): Promise<AgentStepResult> {
  const profile = agentState.profile as DocumentProfile | undefined;
  const requirements = agentState.clauseRequirements as
    | ClauseRequirement[]
    | undefined;
  const existingDecisions = agentState.decisions; // обязательное поле на верхнем уровне
  const lastAnswer = agentState.internalData.lastAnswer as UserAnswer | undefined;

  if (!profile) {
    throw new Error("Profile not found in agent state");
  }

  // PRO: If we have a lastAnswer, process it first
  if (lastAnswer) {
    const updatedDecisions = processDecisionAnswer(agentState, lastAnswer.questionId, lastAnswer);
    agentState = { ...agentState, decisions: updatedDecisions }; // обновляем на верхнем уровне
    console.log(`[decision_collector] Processed answer, decisions:`, Object.keys(updatedDecisions));
  }

  // Collect all required decisions from requirements
  const requiredDecisions = new Set<DecisionKey>();
  
  if (requirements) {
    for (const req of requirements) {
      if (req.relatedDecisions) {
        req.relatedDecisions.forEach((key) => requiredDecisions.add(key));
      }
    }
  }

  // Also check profile-based decisions
  if (profile.legalDomains.includes("ip") && profile.legalDomains.includes("services")) {
    requiredDecisions.add("ip_model");
  }
  if (profile.legalDomains.includes("data_protection_ru")) {
    requiredDecisions.add("pd_regime_ru");
  }
  if (profile.legalDomains.includes("liability")) {
    requiredDecisions.add("liability_cap");
  }
  if (profile.legalDomains.includes("termination")) {
    requiredDecisions.add("termination_rights");
  }
  if (profile.legalDomains.includes("governing_law")) {
    requiredDecisions.add("governing_law");
    requiredDecisions.add("dispute_resolution");
  }
  // PRO: term_renewal - это LegalBlock, проверяем через mandatoryBlocks
  if (profile.mandatoryBlocks.includes("term_renewal") || profile.optionalBlocks.includes("term_renewal")) {
    requiredDecisions.add("term");
    requiredDecisions.add("auto_renewal");
  }
  if (profile.legalDomains.includes("sla")) {
    requiredDecisions.add("sla_level");
  }
  if (profile.legalDomains.includes("payment")) {
    requiredDecisions.add("payment_terms");
  }

  // Check which decisions are already made
  const madeDecisions = existingDecisions ? Object.keys(existingDecisions) : [];
  const missingDecisions = Array.from(requiredDecisions).filter(
    (key) => !madeDecisions.includes(key)
  );

  if (missingDecisions.length === 0) {
    // All decisions collected
    const chatMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: `Все необходимые решения получены. Формирую структуру документа...`,
      timestamp: new Date(),
    };

    return {
      type: "continue",
      state: agentState,
      chatMessages: [chatMessage],
    };
  }

  // Need to collect a decision
  const decisionKey = missingDecisions[0];
  const question = createDecisionQuestion(decisionKey, profile);

  const chatMessage: ChatMessage = {
    id: `msg-${Date.now()}`,
    role: "assistant",
    content: `Для корректного составления документа нужно принять решение: ${question.title}`,
    timestamp: new Date(),
  };

  return {
    type: "need_user_input",
    state: agentState,
    question,
    chatMessages: [chatMessage],
  };
}

/**
 * Create question for a specific decision
 */
function createDecisionQuestion(
  decisionKey: DecisionKey,
  profile: DocumentProfile
): UserQuestion {
  const questions: Record<DecisionKey, () => UserQuestion> = {
    reasoning_level: () => ({
      id: `question-reasoning-level-${Date.now()}`,
      type: "single_choice",
      title: "Уровень проработки документа",
      text: "Выберите, насколько подробно и глубоко нужно проработать юридический документ.",
      required: true,
      decisionKey: "reasoning_level",
      legalImpact: "Уровень влияет на объём, детализацию и количество защитных положений в договоре.",
      options: [
        {
          id: "basic",
          label: "Базовый",
          legalEffect: "Короткий документ (1–2 страницы), только обязательные условия",
          isRecommended: false,
          riskLevel: "medium",
        },
        {
          id: "standard",
          label: "Стандартный",
          legalEffect: "Рыночный уровень (3–5 страниц), сбалансированные защиты",
          isRecommended: true,
          riskLevel: "low",
        },
        {
          id: "professional",
          label: "Профессиональный",
          legalEffect: "Максимально подробный документ, BigLaw-уровень, edge-cases",
          isRecommended: false,
          riskLevel: "low",
        },
      ],
    }),
    ip_model: () => ({
      id: `question-ip-model-${Date.now()}`,
      type: "single_choice",
      title: "Модель прав на интеллектуальную собственность",
      text: "Как должны быть урегулированы права на результаты работ?",
      decisionKey: "ip_model",
      required: true,
      legalImpact: "Отчуждение прав дает максимальную защиту заказчику, лицензия сохраняет права у исполнителя.",
      options: [
        {
          id: "ip-assignment",
          label: "Полное отчуждение прав заказчику",
          legalEffect: "Все права переходят к заказчику, исполнитель теряет права на результаты",
          riskLevel: "low",
          isRecommended: true,
          isMarketStandard: true,
        },
        {
          id: "ip-license-exclusive",
          label: "Исключительная лицензия заказчику",
          legalEffect: "Заказчик получает исключительные права, исполнитель сохраняет авторство",
          riskLevel: "low",
          isMarketStandard: true,
        },
        {
          id: "ip-license-non-exclusive",
          label: "Неисключительная лицензия",
          legalEffect: "Заказчик получает право использования, исполнитель может лицензировать другим",
          riskLevel: "medium",
        },
        {
          id: "ip-work-for-hire",
          label: "Служебное произведение",
          legalEffect: "Права принадлежат работодателю по умолчанию (для трудовых отношений)",
          riskLevel: "low",
        },
      ],
    }),

    liability_cap: () => ({
      id: `question-liability-cap-${Date.now()}`,
      type: "single_choice",
      title: "Ограничение ответственности",
      text: "Какой лимит ответственности установить?",
      decisionKey: "liability_cap",
      required: true,
      legalImpact: "Лимит ответственности защищает от крупных исков, но слишком низкий может быть неприемлем для контрагента.",
      options: [
        {
          id: "cap-12-months",
          label: "12 месяцев платежей (рекомендуется)",
          legalEffect: "Стандартная позиция для enterprise SaaS",
          riskLevel: "low",
          isRecommended: true,
          isMarketStandard: true,
        },
        {
          id: "cap-6-months",
          label: "6 месяцев платежей",
          legalEffect: "Более агрессивная позиция",
          riskLevel: "medium",
        },
        {
          id: "cap-24-months",
          label: "24 месяца платежей",
          legalEffect: "Более мягкая позиция",
          riskLevel: "low",
        },
        {
          id: "cap-none",
          label: "Без ограничения",
          legalEffect: "Высокий риск для исполнителя",
          riskLevel: "high",
        },
      ],
    }),

    governing_law: () => ({
      id: `question-governing-law-${Date.now()}`,
      type: "single_choice",
      title: "Применимое право",
      text: "Какое право должно применяться к договору?",
      decisionKey: "governing_law",
      required: true,
      legalImpact: "Определяет, по каким нормам будет толковаться договор.",
      options: [
        {
          id: "law-ru",
          label: "Российское право",
          legalEffect: "Применяется законодательство РФ",
          riskLevel: "low",
          isRecommended: true,
          isMarketStandard: true,
        },
        {
          id: "law-other",
          label: "Иное право",
          legalEffect: "Требует обоснования и может быть оспорено",
          riskLevel: "high",
        },
      ],
    }),

    dispute_resolution: () => ({
      id: `question-dispute-resolution-${Date.now()}`,
      type: "single_choice",
      title: "Разрешение споров",
      text: "Как будут разрешаться споры?",
      decisionKey: "dispute_resolution",
      required: true,
      legalImpact: "Определяет порядок разрешения конфликтов.",
      options: [
        {
          id: "dispute-court",
          label: "Суд общей юрисдикции / Арбитражный суд",
          legalEffect: "Споры разрешаются в государственных судах",
          riskLevel: "low",
          isRecommended: true,
          isMarketStandard: true,
        },
        {
          id: "dispute-arbitration",
          label: "Третейский суд",
          legalEffect: "Споры разрешаются в третейском суде",
          riskLevel: "medium",
        },
        {
          id: "dispute-mediation",
          label: "Медиация",
          legalEffect: "Споры разрешаются через медиацию",
          riskLevel: "low",
        },
      ],
    }),

    term: () => ({
      id: `question-term-${Date.now()}`,
      type: "free_text",
      title: "Срок действия договора",
      text: "Укажите срок действия договора (например: '1 год', 'бессрочный', 'до выполнения обязательств')",
      decisionKey: "term",
      required: true,
      legalImpact: "Определяет период действия договора и обязательств сторон.",
    }),

    auto_renewal: () => ({
      id: `question-auto-renewal-${Date.now()}`,
      type: "single_choice",
      title: "Автоматическое продление",
      text: "Должен ли договор автоматически продлеваться?",
      decisionKey: "auto_renewal",
      required: true,
      legalImpact: "Автопродление обеспечивает непрерывность отношений, но требует уведомления для расторжения.",
      options: [
        {
          id: "renewal-yes",
          label: "Да, с автопродлением",
          legalEffect: "Договор продлевается автоматически, если не расторгнут",
          riskLevel: "low",
          isRecommended: true,
          isMarketStandard: true,
        },
        {
          id: "renewal-no",
          label: "Нет, без автопродления",
          legalEffect: "Договор действует только в указанный срок",
          riskLevel: "low",
        },
      ],
    }),

    pd_regime_ru: () => ({
      id: `question-pd-regime-${Date.now()}`,
      type: "single_choice",
      title: "Режим обработки персональных данных",
      text: "Какой режим обработки ПД применяется?",
      decisionKey: "pd_regime_ru",
      required: true,
      legalImpact: "Определяет правовой статус сторон в отношении обработки ПД по 152-ФЗ.",
      options: [
        {
          id: "pd-operator",
          label: "Оператор ПД",
          legalEffect: "Сторона самостоятельно определяет цели и состав обрабатываемых ПД",
          riskLevel: "medium",
        },
        {
          id: "pd-processor",
          label: "Обработчик ПД",
          legalEffect: "Сторона обрабатывает ПД по поручению оператора",
          riskLevel: "low",
          isRecommended: true,
        },
        {
          id: "pd-commission",
          label: "Поручение на обработку",
          legalEffect: "Оформляется поручение на обработку ПД",
          riskLevel: "low",
          isMarketStandard: true,
        },
      ],
    }),

    sla_level: () => ({
      id: `question-sla-level-${Date.now()}`,
      type: "single_choice",
      title: "Уровень SLA",
      text: "Какой уровень обслуживания требуется?",
      decisionKey: "sla_level",
      required: true,
      legalImpact: "Определяет гарантии доступности и производительности сервиса.",
      options: [
        {
          id: "sla-99.9",
          label: "99.9% (стандартный)",
          legalEffect: "Стандартный уровень для большинства сервисов",
          riskLevel: "low",
          isRecommended: true,
          isMarketStandard: true,
        },
        {
          id: "sla-99.95",
          label: "99.95% (высокий)",
          legalEffect: "Высокий уровень доступности",
          riskLevel: "low",
        },
        {
          id: "sla-99.99",
          label: "99.99% (критический)",
          legalEffect: "Критический уровень для важных систем",
          riskLevel: "medium",
        },
      ],
    }),

    payment_terms: () => ({
      id: `question-payment-terms-${Date.now()}`,
      type: "free_text",
      title: "Условия оплаты",
      text: "Укажите условия оплаты (например: 'предоплата 50%', 'по факту выполнения', 'ежемесячно')",
      decisionKey: "payment_terms",
      required: true,
      legalImpact: "Определяет порядок и сроки расчетов между сторонами.",
    }),

    termination_rights: () => ({
      id: `question-termination-rights-${Date.now()}`,
      type: "multi_choice",
      title: "Права на расторжение",
      text: "Какие права на расторжение должны быть предусмотрены?",
      decisionKey: "termination_rights",
      required: true,
      legalImpact: "Определяет условия и порядок расторжения договора.",
      options: [
        {
          id: "termination-by-notice",
          label: "Расторжение по уведомлению",
          legalEffect: "Любая сторона может расторгнуть договор, уведомив другую сторону",
          riskLevel: "low",
          isRecommended: true,
          isMarketStandard: true,
        },
        {
          id: "termination-for-cause",
          label: "Расторжение по существенному нарушению",
          legalEffect: "Расторжение возможно при существенном нарушении обязательств",
          riskLevel: "low",
          isRecommended: true,
        },
        {
          id: "termination-immediate",
          label: "Немедленное расторжение",
          legalEffect: "Расторжение возможно немедленно в определенных случаях",
          riskLevel: "medium",
        },
      ],
    }),

    other: () => ({
      id: `question-other-${Date.now()}`,
      type: "free_text",
      title: "Дополнительные условия",
      text: "Укажите дополнительные условия или решения",
      decisionKey: "other",
      required: false,
      legalImpact: "Дополнительные условия могут влиять на структуру и содержание документа.",
    }),
  };

  const questionFactory = questions[decisionKey];
  if (!questionFactory) {
    throw new Error(`Unknown decision key: ${decisionKey}`);
  }

  return questionFactory();
}

/**
 * Process decision answer and update decisions map
 * This is called from pipeline when user answers a decision question
 */
export function processDecisionAnswer(
  agentState: AgentState,
  questionId: string,
  answer: UserAnswer
): DecisionsMap {
  const existingDecisions = agentState.decisions; // обязательное поле на верхнем уровне
  
  // Get the question that was asked - we need to find it by questionId
  // For now, we'll extract decisionKey from the answer context
  // In a real implementation, we'd look up the question from state
  
  // Try to infer decisionKey from questionId pattern
  let decisionKey: DecisionKey | undefined;
  if (questionId.includes("ip-model")) {
    decisionKey = "ip_model";
  } else if (questionId.includes("liability-cap")) {
    decisionKey = "liability_cap";
  } else if (questionId.includes("governing-law")) {
    decisionKey = "governing_law";
  } else if (questionId.includes("dispute-resolution")) {
    decisionKey = "dispute_resolution";
  } else if (questionId.includes("term")) {
    decisionKey = "term";
  } else if (questionId.includes("auto-renewal")) {
    decisionKey = "auto_renewal";
  } else if (questionId.includes("pd-regime")) {
    decisionKey = "pd_regime_ru";
  } else if (questionId.includes("sla-level")) {
    decisionKey = "sla_level";
  } else if (questionId.includes("payment-terms")) {
    decisionKey = "payment_terms";
  } else if (questionId.includes("termination-rights")) {
    decisionKey = "termination_rights";
  }

  if (!decisionKey) {
    console.warn(`[processDecisionAnswer] Could not determine decisionKey from questionId: ${questionId}`);
    return existingDecisions;
  }

  let value: any;
  if (answer.selectedOptionIds && answer.selectedOptionIds.length > 0) {
    value = answer.selectedOptionIds.length === 1 ? answer.selectedOptionIds[0] : answer.selectedOptionIds;
  } else if (answer.freeText) {
    value = answer.freeText;
  } else if (answer.formData) {
    value = answer.formData;
  } else {
    console.warn(`[processDecisionAnswer] No value found in answer for questionId: ${questionId}`);
    return existingDecisions;
  }

  const decision: any = {
    key: decisionKey,
    value,
    source: "user",
    timestamp: new Date().toISOString(),
  };

  return {
    ...existingDecisions,
    [decisionKey]: decision,
  };
}
