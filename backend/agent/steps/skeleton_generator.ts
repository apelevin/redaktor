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
} from "@/lib/types";
import { getOpenRouterClient } from "@/backend/llm/openrouter";
import { updateAgentStateData, updateAgentStateStep, updateUsageStats } from "../state";

interface SkeletonResponse {
  sections: Array<{
    title: string;
    order: number;
  }>;
}

export async function skeletonGenerator(
  agentState: AgentState,
  document: LegalDocument | null
): Promise<AgentStepResult> {
  const mission = agentState.internalData.mission as
    | { documentType: string; jurisdiction: string; businessContext?: string }
    | undefined;
  const issues = agentState.internalData.issues as Issue[] | undefined;

  if (!mission) {
    throw new Error(
      `Mission not found in agent state. Current internalData keys: ${Object.keys(agentState.internalData).join(", ")}`
    );
  }
  
  if (!issues) {
    throw new Error(
      `Issues not found in agent state. Current internalData keys: ${Object.keys(agentState.internalData).join(", ")}`
    );
  }

  const llm = getOpenRouterClient();

  // Generate skeleton using LLM
  const systemPrompt = `Ты - эксперт по юридическим документам. Твоя задача - создать структуру документа (список разделов).

Верни JSON объект со следующей структурой:
{
  "sections": [
    {
      "title": "название раздела на русском языке",
      "order": номер_порядка (начиная с 1)
    }
  ]
}

Важно:
- Создай логичную структуру документа с разделами, которые покрывают все указанные юридические вопросы
- Названия разделов должны быть понятными и отражать их содержание
- Порядок разделов должен быть логичным (обычно: общие положения, предмет, права и обязанности, оплата/условия, ответственность, расторжение, заключительные положения)
- Учитывай тип документа и юрисдикцию`;

  const issuesList = issues.map(i => `- ${i.category}: ${i.description} (${i.severity})`).join("\n");
  
  const userPrompt = `Создай структуру документа:
- Тип документа: ${mission.documentType}
- Юрисдикция: ${mission.jurisdiction}
${mission.businessContext ? `- Контекст: ${mission.businessContext}` : ""}

Юридические вопросы, которые должны быть покрыты:
${issuesList}

Создай список разделов документа, которые логично покрывают все эти вопросы.`;

  try {
    console.log("[skeleton_generator] Calling LLM to generate skeleton for:", mission.documentType);
    const result = await llm.chatJSON<SkeletonResponse>([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);
    
    if (result.usage) {
      agentState = updateUsageStats(agentState, result.usage);
    }

    const response = result.data;
    
    // Convert to DocumentSection format
    const sections: DocumentSection[] = response.sections.map((section, idx) => ({
      id: `section-${idx + 1}`,
      title: section.title,
      order: section.order || idx + 1,
      clauseIds: [],
    }));

    const skeleton: DocumentSkeleton = { sections };
    
    console.log("[skeleton_generator] Generated skeleton with", sections.length, "sections");

    // Update state
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
  } catch (error) {
    console.error("[skeleton_generator] Error generating skeleton:", error);
    throw new Error(`Failed to generate skeleton: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

