/**
 * In-Memory Storage for MVP
 * Stores documents and agent states in memory
 */

import type { LegalDocument, AgentState } from "@/lib/types";

export class InMemoryStorage {
  private documents: Map<string, LegalDocument> = new Map();
  private agentStates: Map<string, AgentState> = new Map();

  // Document operations
  saveDocument(document: LegalDocument): void {
    this.documents.set(document.id, {
      ...document,
      updatedAt: new Date(),
    });
  }

  getDocument(id: string): LegalDocument | undefined {
    return this.documents.get(id);
  }

  updateDocument(id: string, patch: Partial<LegalDocument>): void {
    const existing = this.documents.get(id);
    if (existing) {
      this.documents.set(id, {
        ...existing,
        ...patch,
        updatedAt: new Date(),
      });
    }
  }

  deleteDocument(id: string): boolean {
    return this.documents.delete(id);
  }

  listDocuments(): LegalDocument[] {
    return Array.from(this.documents.values());
  }

  // Agent state operations
  saveAgentState(state: AgentState): void {
    // Deep clone to ensure we save a complete copy
    const stateToSave: AgentState = {
      documentId: state.documentId,
      step: state.step,
      internalData: JSON.parse(JSON.stringify(state.internalData)), // Deep clone
    };
    console.log(`[storage] Saving state for ${state.documentId}, step: ${state.step}, internalData keys:`, Object.keys(stateToSave.internalData));
    this.agentStates.set(state.documentId, stateToSave);
  }

  getAgentState(documentId: string): AgentState | undefined {
    const state = this.agentStates.get(documentId);
    if (!state) {
      console.log(`[storage] No state found for ${documentId}`);
      return undefined;
    }
    // Deep clone to ensure we return a copy, not a reference
    const cloned = {
      documentId: state.documentId,
      step: state.step,
      internalData: JSON.parse(JSON.stringify(state.internalData)), // Deep clone
    };
    console.log(`[storage] Loaded state for ${documentId}, step: ${cloned.step}, internalData keys:`, Object.keys(cloned.internalData));
    return cloned;
  }

  updateAgentState(documentId: string, patch: Partial<AgentState>): void {
    const existing = this.agentStates.get(documentId);
    if (existing) {
      this.agentStates.set(documentId, {
        ...existing,
        ...patch,
      });
    }
  }

  deleteAgentState(documentId: string): boolean {
    return this.agentStates.delete(documentId);
  }

  // Clear all data (useful for testing)
  clear(): void {
    this.documents.clear();
    this.agentStates.clear();
  }
}

// Singleton instance
let storageInstance: InMemoryStorage | null = null;

export function getStorage(): InMemoryStorage {
  if (!storageInstance) {
    storageInstance = new InMemoryStorage();
  }
  return storageInstance;
}

