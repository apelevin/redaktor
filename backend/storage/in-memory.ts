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
    this.agentStates.set(state.documentId, state);
  }

  getAgentState(documentId: string): AgentState | undefined {
    return this.agentStates.get(documentId);
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

