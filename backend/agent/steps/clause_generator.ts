/**
 * Step 6: Clause Generator
 * Generates text for clauses based on requirements and style
 */

import type {
  AgentState,
  LegalDocument,
  AgentStepResult,
  ClauseDraft,
  DocumentSkeleton,
  ClauseRequirement,
  StylePreset,
  ChatMessage,
  DecisionsMap,
  DocumentSizePolicy,
  ContractParty,
} from "@/lib/types";
import { getOpenRouterClient } from "@/backend/llm/openrouter";
import { updateAgentStateData, updateAgentStateStep, updateUsageStats } from "../state";
import { getStorage } from "@/backend/storage/in-memory";

export async function clauseGenerator(
  agentState: AgentState,
  document: LegalDocument | null
): Promise<AgentStepResult> {
  const mission = agentState.mission as any;
  const skeleton = agentState.skeleton as DocumentSkeleton | undefined;
  const requirements = agentState.clauseRequirements as
    | ClauseRequirement[]
    | undefined;
  const stylePreset = agentState.internalData.stylePreset as StylePreset | undefined;
  const decisions = agentState.decisions; // обязательное поле на верхнем уровне
  const sizePolicy = agentState.sizePolicy; // обязательное поле на верхнем уровне
  const parties = agentState.parties; // обязательное поле на верхнем уровне

  if (!mission || !skeleton || !requirements || !stylePreset) {
    throw new Error(
      "Mission, skeleton, requirements, or stylePreset not found in agent state"
    );
  }

  const llm = getOpenRouterClient();
  const storage = getStorage();
  const clauses: ClauseDraft[] = [];

  // Initialize document if it doesn't exist
  let currentDocument = document;
  if (!currentDocument) {
    // PRO: Создаем документ с обязательными полями согласно archv2.md
    currentDocument = {
      id: agentState.documentId,
      mission: mission,
      profile: agentState.profile || {
        primaryPurpose: "юридический документ",
        legalDomains: [],
        mandatoryBlocks: [],
        optionalBlocks: [],
        prohibitedPatterns: [],
        riskPosture: "balanced",
      },
      skeleton: skeleton,
      clauseRequirements: requirements || [],
      clauseDrafts: [],
      finalText: "",
      stylePreset: stylePreset,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    storage.saveDocument(currentDocument);
  }

  // Generate clause for each requirement
  for (const requirement of requirements) {
    const section = skeleton.sections.find((s) => s.id === requirement.sectionId);
    if (!section) continue;

    try {
      const clauseText = await generateClauseText(
        llm,
        requirement,
        section,
        stylePreset,
        mission,
        agentState
      );

      // PRO: Check if clause is locked by user (don't regenerate)
      const existingClause = currentDocument?.clauseDrafts?.find(
        (c) => c.requirementId === requirement.id && c.lockedByUser
      );

      if (existingClause && existingClause.lockedByUser) {
        console.log(`[clause_generator] Skipping locked clause: ${requirement.id}`);
        clauses.push({
          ...existingClause,
          order: clauses.length + 1,
        });
        continue;
      }

      const clause: ClauseDraft = {
        id: `clause-${requirement.id}-${Date.now()}-${clauses.length}`,
        requirementId: requirement.id, // PRO: use requirementId
        sectionId: section.id, // Legacy: for backward compatibility
        text: clauseText,
        reasoningSummary: `Покрывает: ${requirement.relatedIssues?.join(", ") || requirement.purpose}`,
        order: clauses.length + 1,
        source: "model", // PRO: source
        lockedByUser: false, // PRO: not locked
        version: existingClause ? (existingClause.version || 0) + 1 : 1, // PRO: version
      };

      clauses.push(clause);

      // Save intermediate document after each clause is generated
      // PRO: Обновляем clauseRequirementIds в секции согласно archv2.md
      currentDocument = {
        ...currentDocument,
        skeleton: {
          ...currentDocument.skeleton,
          sections: currentDocument.skeleton.sections.map((s) => {
            if (s.id === section.id) {
              // Добавляем requirementId в clauseRequirementIds, если его там еще нет
              const requirementIds = s.clauseRequirementIds || [];
              if (!requirementIds.includes(clause.requirementId)) {
                return {
                  ...s,
                  clauseRequirementIds: [...requirementIds, clause.requirementId],
                };
              }
              return s;
            }
            return s;
          }),
        },
        clauseDrafts: clauses,
        updatedAt: new Date(),
      };
      storage.saveDocument(currentDocument);
      console.log(`[clause_generator] Saved intermediate document with ${clauses.length} clauses`);
    } catch (error) {
      console.error(`Error generating clause for ${section.title}:`, error);
      // Create placeholder clause
      const placeholderClause: ClauseDraft = {
        id: `clause-${requirement.id}-${Date.now()}-${clauses.length}`,
        requirementId: requirement.id,
        text: `[Текст для раздела "${section.title}" будет сгенерирован]`,
        order: clauses.length + 1,
        source: "model",
        lockedByUser: false,
        version: 1,
      };
      clauses.push(placeholderClause);

      // Save intermediate document even with placeholder
      currentDocument = {
        ...currentDocument,
        skeleton: {
          ...currentDocument.skeleton,
          sections: currentDocument.skeleton.sections.map((s) => {
            if (s.id === section.id) {
              const requirementIds = s.clauseRequirementIds || [];
              if (!requirementIds.includes(placeholderClause.requirementId)) {
                return {
                  ...s,
                  clauseRequirementIds: [...requirementIds, placeholderClause.requirementId],
                };
              }
              return s;
            }
            return s;
          }),
        },
        clauseDrafts: clauses,
        updatedAt: new Date(),
      };
      storage.saveDocument(currentDocument);
    }
  }

  // Document is already saved incrementally, just ensure it's up to date
  // (currentDocument was updated in the loop above)

  // Update state with clauses (на верхнем уровне согласно archv2.md)
  const updatedState = updateAgentStateData(agentState, {
    clauseDrafts: clauses,
  });
  // Don't change step here - let pipeline handle it
  // const updatedStateWithStep = updateAgentStateStep(
  //   updatedState,
  //   "document_linter"
  // );

  const chatMessage: ChatMessage = {
    id: `msg-${Date.now()}`,
    role: "assistant",
    content: `Сгенерировал текст для ${clauses.length} пунктов. Выполняю финальную проверку документа...`,
    timestamp: new Date(),
  };

    return {
      type: "continue",
      state: updatedState, // Return state with current step, pipeline will advance it
      documentPatch: {
        id: currentDocument.id,
        mission: currentDocument.mission,
        // PRO: обязательные поля согласно archv2.md
        profile: currentDocument.profile,
        skeleton: currentDocument.skeleton,
        clauseRequirements: currentDocument.clauseRequirements,
        clauseDrafts: clauses,
        finalText: currentDocument.finalText,
        stylePreset: currentDocument.stylePreset,
        updatedAt: currentDocument.updatedAt,
      },
      chatMessages: [chatMessage],
    };
}

async function generateClauseText(
  llm: any,
  requirement: ClauseRequirement,
  section: any,
  stylePreset: StylePreset,
  mission: any,
  agentState: AgentState
): Promise<string> {
  const decisions = agentState.decisions; // обязательное поле на верхнем уровне
  const sizePolicy = agentState.sizePolicy; // обязательное поле на верхнем уровне
  const parties = agentState.parties; // обязательное поле на верхнем уровне

  // PRO: Build decisions context
  const decisionsContext = decisions
    ? Object.entries(decisions)
        .map(([key, record]) => `${key}: ${JSON.stringify(record.value)}`)
        .join("\n")
    : "";

  // PRO: Build parties context
  const partiesContext = parties
    ? parties
        .map((p) => `${p.displayName} (${p.legalName || "не указано"})`)
        .join(", ")
    : "";

  const verbosity = sizePolicy?.verbosity || "medium";
  const verbosityInstruction =
    verbosity === "low"
      ? "Кратко, только основные положения"
      : verbosity === "high"
      ? "Подробно, с детализацией и edge-cases"
      : "Стандартный уровень детализации";

  const systemPrompt = `Ты - эксперт по российскому праву. Твоя задача - написать текст пункта для юридического документа.

Стиль документа:
- Семейство: ${stylePreset.family}
- Формальность: ${stylePreset.formality}
- Длина предложений: ${stylePreset.sentenceLength}
- Юрисдикция: ${mission.jurisdiction?.join(", ") || "RU"}
- Уровень детализации: ${verbosityInstruction}

Напиши текст пункта для раздела "${section.title}".

Требования:
- Цель: ${requirement.purpose}
- Обязательные элементы: ${requirement.requiredElements.join(", ")}
- Рекомендуемые элементы: ${requirement.recommendedElements.join(", ") || "нет"}
${requirement.riskNotes ? `- Примечания о рисках: ${requirement.riskNotes}` : ""}
${decisionsContext ? `- Принятые решения:\n${decisionsContext}` : ""}
${partiesContext ? `- Стороны договора: ${partiesContext}` : ""}
${requirement.relatedDomains ? `- Правовые домены: ${requirement.relatedDomains.join(", ")}` : ""}

ВАЖНО - Форматирование:
- Каждый пронумерованный подпункт (например, 1.1.1., 1.1.2., 1.2.1. и т.д.) ДОЛЖЕН начинаться с новой строки
- Между подпунктами должен быть перенос строки (пустая строка или хотя бы один перенос)
- НЕ размещайте несколько подпунктов на одной строке
- Если в пункте есть несколько определений или подпунктов, каждый должен быть на отдельной строке
- Используйте правильную нумерацию: каждый новый подпункт начинается с новой строки

ВАЖНО - Учет решений:
- Используй принятые решения пользователя при формулировке текста
- Если решение не принято, используй стандартную формулировку

Верни только текст пункта, без дополнительных комментариев. Текст должен быть готов для использования в юридическом документе.`;

  const userPrompt = `Напиши текст пункта для раздела "${section.title}" согласно требованиям выше.`;

  const result = await llm.chat([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  // Update usage statistics in agent state
  if (result.usage) {
    agentState = updateUsageStats(agentState, result.usage);
  }

  // Post-process text to ensure proper formatting
  let formattedText = result.content.trim();
  
  // Fix formatting: ensure each numbered sub-point starts on a new line
  // Pattern: matches numbered sub-points like "1.1.1.", "1.2.3.", etc.
  formattedText = formattedText.replace(/(\d+\.\d+\.\d+\.)/g, '\n$1');
  
  // Fix formatting: ensure sub-points like "1.1.", "1.2.", etc. start on new line
  formattedText = formattedText.replace(/(\d+\.\d+\.)/g, '\n$1');
  
  // Fix formatting: ensure main points like "1.", "2.", etc. start on new line (if not at start)
  formattedText = formattedText.replace(/([^\n])(\d+\.\s)/g, '$1\n$2');
  
  // Remove multiple consecutive newlines (more than 2)
  formattedText = formattedText.replace(/\n{3,}/g, '\n\n');
  
  // Remove leading/trailing newlines
  formattedText = formattedText.trim();
  
  // Ensure proper spacing: add newline before numbered points that are on the same line as previous text
  // This handles cases like "text. 1.1.1." -> "text.\n1.1.1."
  formattedText = formattedText.replace(/([^.\n])(\s+)(\d+\.\d+\.\d+\.)/g, '$1\n$3');
  formattedText = formattedText.replace(/([^.\n])(\s+)(\d+\.\d+\.)/g, '$1\n$3');
  
  return formattedText;
}

