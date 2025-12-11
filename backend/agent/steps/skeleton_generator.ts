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
} from "@/lib/types";
import { updateAgentStateData, updateAgentStateStep } from "../state";

export async function skeletonGenerator(
  agentState: AgentState,
  document: LegalDocument | null
): Promise<AgentStepResult> {
  const mission = agentState.internalData.mission as
    | { documentType: string; jurisdiction: string }
    | undefined;
  const issues = agentState.internalData.issues as any[] | undefined;

  if (!mission || !issues) {
    throw new Error("Mission or issues not found in agent state");
  }

  // Generate skeleton based on document type and jurisdiction
  const skeleton = generateSkeletonForType(mission.documentType, mission.jurisdiction, issues);

  // Update state
  const updatedState = updateAgentStateData(agentState, { skeleton });
  const updatedStateWithStep = updateAgentStateStep(
    updatedState,
    "clause_requirements_generator"
  );

  const chatMessage: ChatMessage = {
    id: `msg-${Date.now()}`,
    role: "assistant",
    content: `Создал структуру документа из ${skeleton.sections.length} разделов. Определяю требования к каждому пункту...`,
    timestamp: new Date(),
  };

  return {
    type: "continue",
    state: updatedStateWithStep,
    chatMessages: [chatMessage],
  };
}

function generateSkeletonForType(
  documentType: string,
  jurisdiction: string,
  issues: any[]
): DocumentSkeleton {
  const sections: DocumentSection[] = [];
  let order = 1;

  // Base sections for different document types
  if (documentType === "NDA") {
    sections.push({
      id: `section-${order++}`,
      title: "Определения",
      order: sections.length + 1,
      clauseIds: [],
    });
    sections.push({
      id: `section-${order++}`,
      title: "Обязательства по конфиденциальности",
      order: sections.length + 1,
      clauseIds: [],
    });
    sections.push({
      id: `section-${order++}`,
      title: "Исключения",
      order: sections.length + 1,
      clauseIds: [],
    });
    sections.push({
      id: `section-${order++}`,
      title: "Срок действия",
      order: sections.length + 1,
      clauseIds: [],
    });

    // Add optional sections based on issues
    if (issues.some((i) => i.category === "Non-Solicit")) {
      sections.push({
        id: `section-${order++}`,
        title: "Запрет переманивания сотрудников",
        order: sections.length + 1,
        clauseIds: [],
      });
    }
    if (issues.some((i) => i.category === "Non-Compete")) {
      sections.push({
        id: `section-${order++}`,
        title: "Запрет конкуренции",
        order: sections.length + 1,
        clauseIds: [],
      });
    }
    if (issues.some((i) => i.category === "Audit Rights")) {
      sections.push({
        id: `section-${order++}`,
        title: "Права на аудит",
        order: sections.length + 1,
        clauseIds: [],
      });
    }
  } else if (documentType === "SaaS_MSA") {
    sections.push({
      id: `section-${order++}`,
      title: "Определения",
      order: sections.length + 1,
      clauseIds: [],
    });
    sections.push({
      id: `section-${order++}`,
      title: "Предмет договора",
      order: sections.length + 1,
      clauseIds: [],
    });
    sections.push({
      id: `section-${order++}`,
      title: "Права и обязанности сторон",
      order: sections.length + 1,
      clauseIds: [],
    });
    sections.push({
      id: `section-${order++}`,
      title: "Ограничение ответственности",
      order: sections.length + 1,
      clauseIds: [],
    });
    sections.push({
      id: `section-${order++}`,
      title: "Интеллектуальная собственность",
      order: sections.length + 1,
      clauseIds: [],
    });
    sections.push({
      id: `section-${order++}`,
      title: "Срок действия и расторжение",
      order: sections.length + 1,
      clauseIds: [],
    });
    sections.push({
      id: `section-${order++}`,
      title: "Разрешение споров",
      order: sections.length + 1,
      clauseIds: [],
    });

    if (issues.some((i) => i.category === "SLA")) {
      sections.push({
        id: `section-${order++}`,
        title: "Уровни обслуживания",
        order: sections.length + 1,
        clauseIds: [],
      });
    }
  } else {
    // Generic structure
    sections.push({
      id: `section-${order++}`,
      title: "Определения",
      order: sections.length + 1,
      clauseIds: [],
    });
    sections.push({
      id: `section-${order++}`,
      title: "Предмет договора",
      order: sections.length + 1,
      clauseIds: [],
    });
    sections.push({
      id: `section-${order++}`,
      title: "Права и обязанности сторон",
      order: sections.length + 1,
      clauseIds: [],
    });
    sections.push({
      id: `section-${order++}`,
      title: "Срок действия и расторжение",
      order: sections.length + 1,
      clauseIds: [],
    });
    sections.push({
      id: `section-${order++}`,
      title: "Разное",
      order: sections.length + 1,
      clauseIds: [],
    });
  }

  return { sections };
}

