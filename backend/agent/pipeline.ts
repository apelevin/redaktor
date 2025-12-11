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
} from "@/lib/types";
import { getStorage } from "@/backend/storage/in-memory";
import { getNextStep } from "./state";
import { missionInterpreter } from "./steps/mission_interpreter";
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
    agentState = {
      documentId,
      step: "mission_interpreter",
      internalData: {},
    };
  }
  
  console.log(`[pipeline] Executing step: ${agentState.step}, documentId: ${agentState.documentId}`);

  // Handle user answer if provided
  if (request.userAnswer && agentState) {
    // Store the answer in agent state
    console.log(`[pipeline] Received user answer for question: ${request.userAnswer.questionId}`);
    agentState.internalData.lastAnswer = request.userAnswer;
    // Save state immediately with the answer
    storage.saveAgentState(agentState);
  }

  // Apply document changes if provided
  if (request.documentChanges && document) {
    document = { ...document, ...request.documentChanges };
    storage.saveDocument(document);
  }

  // Execute current step
  const currentStep = agentState.step;
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

    // Auto-continue if result is "continue" and there's a next step
    if (result.type === "continue") {
      const nextStep = getNextStep(result.state.step);
      console.log(`[pipeline] Current step: ${result.state.step}, next step: ${nextStep}`);
      
      if (nextStep) {
        // Update state to next step - preserve all internalData
        const updatedState: AgentState = {
          ...result.state,
          step: nextStep,
        };
        console.log(`[pipeline] Updating step to ${nextStep}, preserving internalData keys:`, Object.keys(updatedState.internalData));
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

