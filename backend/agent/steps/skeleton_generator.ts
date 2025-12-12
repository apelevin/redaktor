/**
 * Step 3: Skeleton Generator
 * Creates document structure (DocumentSkeleton) based on mission and issues
 */

import type {
  AgentState,
  LegalDocument,
  AgentStepResult,
  DocumentSkeleton,
  DocumentSection,
  ChatMessage,
  Issue,
  DocumentProfile,
  DocumentSizePolicy,
  LegalBlock,
} from "@/lib/types";
import { getOpenRouterClient } from "@/backend/llm/openrouter";
import { updateAgentStateData, updateAgentStateStep, updateUsageStats } from "../state";

interface SkeletonResponse {
  sections: Array<{
    title: string;
    order: number;
  }>;
}

// PRO: Map LegalBlock to section title
const BLOCK_TO_TITLE: Record<LegalBlock, string> = {
  preamble_parties: "Преамбула. Стороны договора",
  definitions: "Термины и определения",
  subject_scope: "Предмет договора",
  deliverables_acceptance: "Результаты работ. Приемка",
  fees_payment: "Стоимость и порядок расчетов",
  confidentiality: "Конфиденциальность",
  ip_rights: "Интеллектуальная собственность",
  license_terms: "Условия лицензирования",
  service_levels_sla: "Уровень обслуживания (SLA)",
  data_protection_ru: "Обработка персональных данных",
  info_security: "Информационная безопасность",
  warranties: "Гарантии и заверения",
  liability_cap_exclusions: "Ответственность сторон",
  indemnities: "Возмещение ущерба",
  term_renewal: "Срок действия и продление",
  termination: "Расторжение договора",
  force_majeure: "Форс-мажор",
  dispute_resolution: "Разрешение споров",
  governing_law: "Применимое право",
  notices: "Уведомления",
  misc: "Прочие условия",
};

export async function skeletonGenerator(
  agentState: AgentState,
  document: LegalDocument | null
): Promise<AgentStepResult> {
  const mission = agentState.mission as any;
  const profile = agentState.profile as DocumentProfile | undefined;
  const sizePolicy = agentState.sizePolicy; // обязательное поле на верхнем уровне
  const issues = agentState.internalData.issues as Issue[] | undefined;

  if (!mission) {
    throw new Error("Mission not found in agent state");
  }
  
  if (!profile) {
    throw new Error("Profile not found in agent state - profile_builder must run first");
  }

  if (!issues) {
    throw new Error("Issues not found in agent state - issue_spotter must run first");
  }

  const llm = getOpenRouterClient();

  // PRO: Start with mandatory blocks
  const mandatorySections: DocumentSection[] = profile.mandatoryBlocks.map((block, idx) => ({
    id: `section-${block}-${idx}`,
    title: BLOCK_TO_TITLE[block] || block,
    order: idx + 1,
    clauseRequirementIds: [],
  }));

  // PRO: Add optional blocks if sizePolicy allows
  const optionalSections: DocumentSection[] = (sizePolicy?.includeOptionalProtections
    ? profile.optionalBlocks
    : []
  ).map((block, idx) => ({
    id: `section-${block}-${idx}`,
    title: BLOCK_TO_TITLE[block] || block,
    order: mandatorySections.length + idx + 1,
    clauseRequirementIds: [],
  }));

  // PRO: Apply sizePolicy to limit number of sections
  let allSections = [...mandatorySections, ...optionalSections];
  if (sizePolicy && allSections.length > sizePolicy.maxSections) {
    // Keep mandatory sections, limit optional
    allSections = [
      ...mandatorySections,
      ...optionalSections.slice(0, sizePolicy.maxSections - mandatorySections.length),
    ];
  }

  // Use LLM to refine structure if needed (for basic level, might merge sections)
  if (sizePolicy?.verbosity === "low" && allSections.length > 6) {
    // For basic level, try to merge sections
    const systemPrompt = `Ты - эксперт по юридическим документам. Твоя задача - оптимизировать структуру документа для базового уровня.

Верни JSON объект со следующей структурой:
{
  "sections": [
    {
      "title": "название раздела на русском языке",
      "order": номер_порядка
    }
  ]
}

Важно:
- Объедини логически связанные разделы
- Максимум 6 разделов для базового уровня
- Сохрани все обязательные блоки`;

    const userPrompt = `Оптимизируй структуру документа для базового уровня:
Обязательные блоки: ${profile.mandatoryBlocks.join(", ")}
Опциональные блоки: ${profile.optionalBlocks.join(", ")}

Создай компактную структуру, объединяя связанные разделы.`;

    try {
      const result = await llm.chatJSON<SkeletonResponse>([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ]);
      
      if (result.usage) {
        agentState = updateUsageStats(agentState, result.usage);
      }

      // Use LLM-optimized structure
      allSections = result.data.sections.map((section, idx) => ({
        id: `section-${idx}`,
        title: section.title,
        order: section.order || idx + 1,
        clauseRequirementIds: [],
      }));
    } catch (error) {
      console.warn("[skeleton_generator] LLM optimization failed, using rule-based structure:", error);
      // Fallback to rule-based structure
    }
  }

  // Create skeleton from sections
  const skeleton: DocumentSkeleton = { sections: allSections };
  
  console.log("[skeleton_generator] Generated skeleton with", allSections.length, "sections", {
    mandatory: mandatorySections.length,
    optional: optionalSections.length,
    total: allSections.length,
  });

  // Update state (skeleton на верхнем уровне согласно archv2.md)
  const updatedState = updateAgentStateData(agentState, { skeleton });
  // Don't change step here - let pipeline handle it

  const chatMessage: ChatMessage = {
    id: `msg-${Date.now()}`,
    role: "assistant",
    content: `Создал структуру документа из ${skeleton.sections.length} разделов. Определяю требования к каждому пункту...`,
    timestamp: new Date(),
  };

  return {
    type: "continue",
    state: updatedState, // Return state with current step, pipeline will advance it
    chatMessages: [chatMessage],
  };
}

