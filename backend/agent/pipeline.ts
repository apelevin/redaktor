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

  // Load or create document
  if (agentState) {
    document = storage.getDocument(agentState.documentId) || null;
  } else {
    // Create new document and state
    const documentId = `doc-${Date.now()}`;
    agentState = {
      documentId,
      step: "mission_interpreter",
      internalData: {},
    };
  }

  // Handle user answer if provided
  if (request.userAnswer && agentState) {
    // Store the answer in agent state
    agentState.internalData.lastAnswer = request.userAnswer;
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
    storage.saveAgentState(result.state);
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
      if (nextStep) {
        // Update state to next step
        result.state.step = nextStep;
        storage.saveAgentState(result.state);

        // Recursively call next step
        return executePipelineStep({
          agentState: result.state,
        });
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

