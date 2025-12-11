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
} from "@/lib/types";
import { getOpenRouterClient } from "@/backend/llm/openrouter";
import { updateAgentStateData, updateAgentStateStep } from "../state";
import { getStorage } from "@/backend/storage/in-memory";

export async function clauseGenerator(
  agentState: AgentState,
  document: LegalDocument | null
): Promise<AgentStepResult> {
  const mission = agentState.internalData.mission as any;
  const skeleton = agentState.internalData.skeleton as DocumentSkeleton | undefined;
  const requirements = agentState.internalData.clauseRequirements as
    | ClauseRequirement[]
    | undefined;
  const stylePreset = agentState.internalData.stylePreset as StylePreset | undefined;

  if (!mission || !skeleton || !requirements || !stylePreset) {
    throw new Error(
      "Mission, skeleton, requirements, or stylePreset not found in agent state"
    );
  }

  const llm = getOpenRouterClient();
  const clauses: ClauseDraft[] = [];
  
  // Initialize cost tracking if not exists
  if (!agentState.internalData.totalCost) {
    agentState.internalData.totalCost = 0;
  }
  if (!agentState.internalData.totalTokens) {
    agentState.internalData.totalTokens = 0;
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

      const clause: ClauseDraft = {
        id: `clause-${section.id}-${Date.now()}`,
        sectionId: section.id,
        text: clauseText,
        reasoningSummary: `Покрывает: ${requirement.relatedIssues.join(", ")}`,
        order: clauses.length + 1,
      };

      clauses.push(clause);
    } catch (error) {
      console.error(`Error generating clause for ${section.title}:`, error);
      // Create placeholder clause
      clauses.push({
        id: `clause-${section.id}-${Date.now()}`,
        sectionId: section.id,
        text: `[Текст для раздела "${section.title}" будет сгенерирован]`,
        order: clauses.length + 1,
      });
    }
  }

  // Create or update document
  const storage = getStorage();
  let currentDocument = document;

  if (!currentDocument) {
    currentDocument = {
      id: agentState.documentId,
      mission: mission,
      sections: skeleton.sections.map((s) => ({
        ...s,
        clauseIds: clauses.filter((c) => c.sectionId === s.id).map((c) => c.id),
      })),
      clauses: clauses,
      stylePreset: stylePreset,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  } else {
    currentDocument = {
      ...currentDocument,
      clauses: clauses,
      sections: skeleton.sections.map((s) => ({
        ...s,
        clauseIds: clauses.filter((c) => c.sectionId === s.id).map((c) => c.id),
      })),
      updatedAt: new Date(),
    };
  }

  storage.saveDocument(currentDocument);

  // Update state
  const updatedState = updateAgentStateData(agentState, {});
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
      clauses: clauses,
      sections: currentDocument.sections,
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
  const systemPrompt = `Ты - эксперт по юридическим документам. Твоя задача - написать текст пункта для юридического документа.

Стиль документа:
- Семейство: ${stylePreset.family}
- Формальность: ${stylePreset.formality}
- Длина предложений: ${stylePreset.sentenceLength}
- Юрисдикция: ${mission.jurisdiction}
- Тип документа: ${mission.documentType}

Напиши текст пункта для раздела "${section.title}".

Требования:
- Цель: ${requirement.purpose}
- Обязательные элементы: ${requirement.requiredElements.join(", ")}
- Рекомендуемые элементы: ${requirement.recommendedElements.join(", ") || "нет"}
${requirement.riskNotes ? `- Примечания о рисках: ${requirement.riskNotes}` : ""}

Верни только текст пункта, без дополнительных комментариев. Текст должен быть готов для использования в юридическом документе.`;

  const userPrompt = `Напиши текст пункта для раздела "${section.title}" согласно требованиям выше.`;

  const result = await llm.chat([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  // Update cost and tokens in agent state
  if (result.usage) {
    agentState.internalData.totalCost = (agentState.internalData.totalCost || 0) + (result.usage.cost || 0);
    agentState.internalData.totalTokens = (agentState.internalData.totalTokens || 0) + result.usage.totalTokens;
  }

  return result.content.trim();
}

