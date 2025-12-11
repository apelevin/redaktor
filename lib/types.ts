// Document types
export type DocumentType = "NDA" | "SaaS_MSA" | "SERVICE_AGREEMENT" | "PRIVACY_POLICY" | "OTHER";

export type Jurisdiction = "RU" | "US" | "EU" | "UK" | "OTHER";

export type StylePresetFamily = "anglo_saxon" | "civil_ru" | "enterprise_legalese" | "plain_language" | "balanced";

export interface LegalDocumentMission {
  documentType: DocumentType;
  jurisdiction: Jurisdiction;
  language: string;
  partyA?: string;
  partyB?: string;
  businessContext?: string;
  userGoals?: string[];
  stylePresetId?: string;
  riskTolerance?: "low" | "medium" | "high";
}

export interface StylePreset {
  id: string;
  family: StylePresetFamily;
  sentenceLength: "short" | "medium" | "long";
  formality: "low" | "medium" | "high";
  definitionPlacement: "beginning" | "inline" | "appendix";
  crossReferenceFormat: "numeric" | "section_name" | "hybrid";
}

export interface DocumentSection {
  id: string;
  title: string;
  order: number;
  clauseIds: string[];
}

export interface ClauseDraft {
  id: string;
  sectionId: string;
  text: string;
  reasoningSummary?: string;
  order: number;
}

export interface LegalDocument {
  id: string;
  mission: LegalDocumentMission;
  sections: DocumentSection[];
  clauses: ClauseDraft[];
  stylePreset: StylePreset;
  createdAt?: Date;
  updatedAt?: Date;
}

// Issue types
export interface Issue {
  id: string;
  category: string; // "IP", "SLA", "Confidentiality", etc.
  description: string;
  severity: "low" | "medium" | "high";
  required: boolean;
}

// Document skeleton
export interface DocumentSkeleton {
  sections: DocumentSection[];
}

// Clause requirements
export interface ClauseRequirement {
  id: string;
  sectionId: string;
  purpose: string;
  relatedIssues: string[]; // Issue IDs
  requiredElements: string[];
  recommendedElements: string[];
  riskNotes?: string;
}

// Question types
export type QuestionType = "single_choice" | "multi_choice" | "free_text";

export interface QuestionOption {
  id: string;
  label: string;
  description?: string;
  riskLevel?: "low" | "medium" | "high";
  isRecommended?: boolean;
}

export interface UserQuestion {
  id: string;
  type: QuestionType;
  title: string;
  text: string; // зачем вопрос и что от ответа зависит
  options?: QuestionOption[];
  relatesToSectionId?: string; // к какой секции документа относится
  relatesToClauseId?: string; // к какому пункту относится
  legalImpact: string; // кратко: юридические последствия выбора
}

export interface UserAnswer {
  questionId: string;
  selectedOptionIds?: string[];
  freeText?: string;
}

// Agent state
export interface AgentState {
  documentId: string;
  step: string; // текущий этап пайплайна
  internalData: {
    mission?: LegalDocumentMission;
    issues?: Issue[];
    skeleton?: DocumentSkeleton;
    clauseRequirements?: ClauseRequirement[];
    stylePreset?: StylePreset;
    [key: string]: any; // для любых промежуточных структур
  };
}

// Chat message
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// Agent step result
export type AgentStepResult =
  | {
      type: "continue"; // агент сделал шаг, можно сразу продолжать
      state: AgentState;
      documentPatch?: Partial<LegalDocument>;
      chatMessages: ChatMessage[];
    }
  | {
      type: "need_user_input"; // агент остановился и ждёт ответ
      state: AgentState;
      documentPatch?: Partial<LegalDocument>;
      question: UserQuestion;
      chatMessages: ChatMessage[]; // обычно сообщение, объясняющее вопрос
    }
  | {
      type: "finished"; // документ готов
      state: AgentState;
      document: LegalDocument;
      chatMessages: ChatMessage[];
    };

// UI state
export interface UIState {
  document: LegalDocument | null;
  agentState: AgentState | null;
  pendingQuestion?: UserQuestion;
  chatMessages: ChatMessage[];
  isLoading: boolean;
  error?: string;
}

// API request/response types
export interface AgentStepRequest {
  userMessage?: string;
  agentState: AgentState | null;
  userAnswer?: UserAnswer;
  documentChanges?: Partial<LegalDocument>;
}

export interface AgentStepResponse {
  result: AgentStepResult;
}

