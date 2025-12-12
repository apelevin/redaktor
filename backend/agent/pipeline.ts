/**
 * Agent Pipeline Orchestrator
 * Coordinates the execution of pipeline steps
 */

import type {
  AgentState,
  LegalDocument,
  AgentStepResult,
  AgentStepRequest,
  ChatMessage,
  ContractParty,
  PipelineStepId,
} from "@/lib/types";
import { getStorage } from "@/backend/storage/in-memory";
import {
  getNextStep,
  getNextStepFromPlan,
  getCurrentStepFromPlan,
  createInitialAgentState,
  advanceStepCursor,
} from "./state";
import { missionInterpreter } from "./steps/mission_interpreter";
import { profileBuilder } from "./steps/profile_builder";
import { partyDetailsCollector, processPartyFormData } from "./steps/party_details_collector";
import { decisionCollector, processDecisionAnswer } from "./steps/decision_collector";
import { issueSpotter } from "./steps/issue_spotter";
import { skeletonGenerator } from "./steps/skeleton_generator";
import { clauseRequirementsGenerator } from "./steps/clause_requirements_generator";
import { stylePlanner } from "./steps/style_planner";
import { clauseGenerator } from "./steps/clause_generator";
import { documentLinter } from "./steps/document_linter";

export async function executePipelineStep(
  request: AgentStepRequest
): Promise<AgentStepResult> {
  const storage = getStorage();
  let agentState = request.agentState;
  let document: LegalDocument | null = null;

  // PRO: Handle conversationId
  const conversationId = request.conversationId;

  // Load or create document and state
  if (agentState) {
    // Always load fresh state from storage to ensure we have all data
    const freshState = storage.getAgentState(agentState.documentId);
    if (freshState) {
      console.log(`[pipeline] Loaded fresh state for ${agentState.documentId}, step: ${freshState.step}, internalData keys:`, Object.keys(freshState.internalData));
      agentState = freshState;
    } else {
      console.log(`[pipeline] No fresh state found for ${agentState.documentId}, using provided state`);
    }
    document = storage.getDocument(agentState.documentId) || null;
  } else {
    // Create new document and state
    const documentId = `doc-${Date.now()}`;
    console.log(`[pipeline] Creating new document and state: ${documentId}`);
    if (!conversationId) {
      throw new Error("conversationId is required");
    }
    // PRO: conversationId обязателен согласно archv2.md
    if (!conversationId) {
      throw new Error("conversationId is required when creating new agent state");
    }
    // PRO: reasoningLevel будет установлен из запроса или через HITL согласно reasoning.md
    agentState = createInitialAgentState(documentId, conversationId);
  }

  // PRO: Ensure conversationId is set (обязательное поле согласно archv2.md)
  if (!agentState.conversationId) {
    if (!conversationId) {
      throw new Error("conversationId is required");
    }
    agentState.conversationId = conversationId;
  }

  // PRO: Обрабатываем reasoningLevel из запроса (для первого запроса согласно reasoning.md)
  if (request.reasoningLevel && !agentState.mission?.reasoningLevel) {
    const { getSizePolicy } = await import("./rules/sizePolicy");
    const reasoningLevel = request.reasoningLevel;
    
    // Обновляем sizePolicy согласно выбранному уровню
    agentState.sizePolicy = getSizePolicy(reasoningLevel);
    
    // Сохраняем в decisions согласно reasoning.md (строки 94-99)
    agentState.decisions = {
      ...agentState.decisions,
      reasoning_level: {
        key: "reasoning_level",
        value: reasoningLevel,
        source: "user",
        timestamp: new Date().toISOString(),
      },
    };
    
    console.log(`[pipeline] Set reasoningLevel from request: ${reasoningLevel}`);
  }

  // PRO: Ensure required fields exist (для миграции старых состояний)
  if (!agentState.sizePolicy) {
    const { getSizePolicy } = await import("./rules/sizePolicy");
    agentState.sizePolicy = getSizePolicy("standard");
  }
  if (!agentState.parties) {
    agentState.parties = [];
  }
  if (!agentState.decisions) {
    agentState.decisions = {};
  }

  // PRO: Ensure plan exists (for backward compatibility)
  if (!agentState.plan || agentState.plan.length === 0) {
    agentState.plan = [
      "mission_interpreter",
      "profile_builder",
      "party_details_collector",
      "decision_collector",
      "issue_spotter",
      "skeleton_generator",
      "clause_requirements_generator",
      "style_planner",
      "clause_generator",
      "document_linter",
    ];
    agentState.stepCursor = agentState.plan.indexOf((agentState.step || "mission_interpreter") as PipelineStepId);
    if (agentState.stepCursor === -1) {
      agentState.stepCursor = 0;
    }
  }

  // PRO: Get current step from plan or use legacy step
  const currentStep = getCurrentStepFromPlan(agentState) || agentState.step || "mission_interpreter";
  
  console.log(`[pipeline] Executing step: ${currentStep}, documentId: ${agentState.documentId}, stepCursor: ${agentState.stepCursor}`);

  // Handle user answer if provided
  if (request.userAnswer && agentState) {
    // Store the answer in agent state
    console.log(`[pipeline] Received user answer for question: ${request.userAnswer.questionId}`);
    agentState.internalData.lastAnswer = request.userAnswer;
    
    // PRO: Process party form data if it's a party question
    if (request.userAnswer.formData && currentStep === "party_details_collector") {
      // Extract role from formData (should be set by frontend)
      const formData = request.userAnswer.formData;
      const role = formData.role as any;
      if (role) {
        const party = processPartyFormData(role, formData);
        // Обновляем parties на верхнем уровне согласно archv2.md
        agentState.parties = [...agentState.parties, party];
        console.log(`[pipeline] Added party: ${party.displayName} (${party.role})`);
      } else {
        console.warn(`[pipeline] Form data provided but role not found in formData`);
      }
    }
    
    // PRO: Process decision answer if it's a decision question
    // decision_collector will process the answer when called again
    // For now, just store the answer - decision_collector will handle processing
    
    // Save state immediately with the answer
    storage.saveAgentState(agentState);
  }

  // PRO: Apply document changes from user
  if (request.documentPatchFromUser && document) {
    document = { ...document, ...request.documentPatchFromUser };
    storage.saveDocument(document);
    console.log(`[pipeline] Applied user document patch`);
  }

  // Apply document changes if provided (legacy)
  if (request.documentChanges && document) {
    document = { ...document, ...request.documentChanges };
    storage.saveDocument(document);
  }

  // Execute current step
  let result: AgentStepResult;

  try {
    switch (currentStep) {
      case "mission_interpreter":
        result = await missionInterpreter(
          request.userMessage || "",
          agentState,
          document
        );
        break;
      case "profile_builder":
        result = await profileBuilder(agentState, document);
        break;
      case "party_details_collector":
        result = await partyDetailsCollector(agentState, document);
        break;
      case "decision_collector":
        result = await decisionCollector(agentState, document);
        break;
      case "issue_spotter":
        result = await issueSpotter(agentState, document);
        break;
      case "skeleton_generator":
        result = await skeletonGenerator(agentState, document);
        break;
      case "clause_requirements_generator":
        result = await clauseRequirementsGenerator(agentState, document);
        break;
      case "style_planner":
        result = await stylePlanner(agentState, document);
        break;
      case "clause_generator":
        result = await clauseGenerator(agentState, document);
        break;
      case "document_linter":
        result = await documentLinter(agentState, document);
        break;
      default:
        throw new Error(`Unknown step: ${currentStep}`);
    }

    // Save updated state and document
    // Make sure we save the complete state with all internalData
    console.log(`[pipeline] Saving state after step ${currentStep}, internalData keys:`, Object.keys(result.state.internalData));
    console.log(`[pipeline] Total cost so far: $${result.state.internalData.totalCost || 0}, tokens: ${result.state.internalData.totalTokens || 0}`);
    storage.saveAgentState(result.state);
    
    // Verify the state was saved correctly
    const savedState = storage.getAgentState(result.state.documentId);
    if (!savedState) {
      throw new Error(`Failed to save agent state for document ${result.state.documentId}`);
    }
    console.log(`[pipeline] State saved successfully, verified keys:`, Object.keys(savedState.internalData));
    
    if (result.type === "continue" || result.type === "need_user_input") {
      if (result.documentPatch) {
        // Load document again in case it was created in the step
        const currentDoc = storage.getDocument(result.state.documentId) || document;
        if (currentDoc) {
          storage.saveDocument({
            ...currentDoc,
            ...result.documentPatch,
          });
        } else if (result.documentPatch.id) {
          // If document doesn't exist but patch has id, create new document
          storage.saveDocument(result.documentPatch as LegalDocument);
        }
      }
    } else if (result.type === "finished") {
      storage.saveDocument(result.document);
    }

    // PRO: Auto-continue if result is "continue" and there's a next step
    if (result.type === "continue") {
      // PRO: Use plan-based next step if available
      const nextStep = getNextStepFromPlan(result.state) || getNextStep(result.state.step || currentStep);
      console.log(`[pipeline] Current step: ${currentStep}, next step: ${nextStep}`);
      
      if (nextStep) {
        // PRO: Advance step cursor
        const updatedState = advanceStepCursor(result.state);
        console.log(`[pipeline] Updated stepCursor to ${updatedState.stepCursor}, next step: ${nextStep}, preserving internalData keys:`, Object.keys(updatedState.internalData));
        storage.saveAgentState(updatedState);

        // Load fresh state from storage to ensure we have all data
        const freshState = storage.getAgentState(result.state.documentId);
        if (!freshState) {
          throw new Error(`Agent state not found for document ${result.state.documentId}`);
        }
        
        console.log(`[pipeline] Loaded fresh state for next step, internalData keys:`, Object.keys(freshState.internalData));
        console.log(`[pipeline] Auto-continuing to step: ${nextStep}`);

        // Recursively call next step with fresh state
        return executePipelineStep({
          conversationId: conversationId || freshState.conversationId,
          agentState: freshState,
        });
      } else {
        console.log(`[pipeline] No next step, pipeline finished`);
      }
    }

    return result;
  } catch (error) {
    // Create error message
    const errorMessage: ChatMessage = {
      id: `error-${Date.now()}`,
      role: "assistant",
      content: `Произошла ошибка на этапе ${currentStep}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      timestamp: new Date(),
    };

    return {
      type: "continue",
      state: agentState,
      chatMessages: [errorMessage],
    };
  }
}

