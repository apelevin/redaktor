// PRO Architecture Types

// Reasoning level - определяет размер и глубину документа
export type ReasoningLevel = "basic" | "standard" | "professional";

// Document size policy based on reasoning level
export interface DocumentSizePolicy {
  targetPages: { min: number; max: number };
  maxSections: number;
  maxClauses: number;
  verbosity: "low" | "medium" | "high";
  includeEdgeCases: boolean;
  includeOptionalProtections: boolean;
}

// Legal domains (модули права/контракта)
export type LegalDomain =
  | "confidentiality"
  | "services"
  | "ip"
  | "license"
  | "sla"
  | "data_protection_ru"
  | "security"
  | "payment"
  | "liability"
  | "termination"
  | "dispute_resolution"
  | "governing_law"
  | "employment_ru"
  | "lease_ru"
  | "consumer"
  | "compliance"
  | "force_majeure"
  | "other";

// Legal blocks (структурные блоки документа)
export type LegalBlock =
  | "preamble_parties"
  | "definitions"
  | "subject_scope"
  | "deliverables_acceptance"
  | "fees_payment"
  | "confidentiality"
  | "ip_rights"
  | "license_terms"
  | "service_levels_sla"
  | "data_protection_ru"
  | "info_security"
  | "warranties"
  | "liability_cap_exclusions"
  | "indemnities"
  | "term_renewal"
  | "termination"
  | "force_majeure"
  | "dispute_resolution"
  | "governing_law"
  | "notices"
  | "misc";

// Document Profile (замена DocumentType)
export interface DocumentProfile {
  primaryPurpose: string; // "договор на услуги разработки", "соглашение о конфиденциальности" и т.п.
  legalDomains: LegalDomain[]; // какие домены участвуют
  mandatoryBlocks: LegalBlock[]; // must-have блоки
  optionalBlocks: LegalBlock[]; // nice-to-have (в зависимости от reasoningLevel)
  prohibitedPatterns: string[]; // запрещённые/опасные паттерны для РФ
  marketArchetype?: string; // ориентир: "Services + IP assignment (RU)"
  riskPosture: "conservative" | "balanced" | "aggressive";
}

// Party roles
export type PartyRole = "customer" | "vendor" | "employer" | "employee" | "landlord" | "tenant" | "contractor" | "other";

// Russian party identifiers
export interface PartyIdentifiersRU {
  inn?: string;
  ogrn?: string;
  kpp?: string;
}

// Party representative
export interface PartyRepresentative {
  name: string;
  position: string;
  basis: string; // "на основании Устава" / "доверенности"
}

// Contract Party (PRO)
export interface ContractParty {
  id: string;
  role: PartyRole;
  displayName: string; // "Заказчик", "Исполнитель" — как в тексте
  legalName?: string; // "ООО «Ромашка»"
  legalForm?: string; // ООО/АО/ИП
  identifiers?: PartyIdentifiersRU;
  address?: string;
  representative?: PartyRepresentative;
  bankDetails?: {
    account?: string;
    bankName?: string;
    bik?: string;
    corrAccount?: string;
  };
}

// Decision keys
export type DecisionKey =
  | "reasoning_level" // PRO: уровень рассуждения согласно reasoning.md
  | "governing_law"
  | "dispute_resolution"
  | "liability_cap"
  | "term"
  | "auto_renewal"
  | "pd_regime_ru"
  | "sla_level"
  | "payment_terms"
  | "termination_rights"
  | "ip_model"
  | "other";

// Decision record
export interface DecisionRecord<T> {
  key: DecisionKey;
  value: T;
  source: "user" | "default" | "model_suggestion";
  timestamp: string;
}

// Decisions map
export type DecisionsMap = Record<string, DecisionRecord<any>>;

// Pipeline step IDs
export type PipelineStepId =
  | "mission_interpreter"
  | "profile_builder"
  | "party_details_collector"
  | "decision_collector"
  | "issue_spotter"
  | "skeleton_generator"
  | "clause_requirements_generator"
  | "style_planner"
  | "clause_generator"
  | "document_linter";

// Legacy types (for backward compatibility during migration)
export type DocumentType = string;
export type Jurisdiction = "RU" | "US" | "EU" | "UK" | "OTHER";

export type StylePresetFamily = "anglo_saxon" | "civil_ru" | "enterprise_legalese" | "plain_language" | "balanced";

export interface LegalDocumentMission {
  rawUserInput: string;
  jurisdiction: string[]; // напр. ["RU"]
  language: "ru" | "en" | "dual";
  parties: ContractParty[]; // обязательный массив (archv2.md)
  businessContext: string;
  userGoals: string[];
  reasoningLevel: ReasoningLevel;
  stylePresetId: string;
  // PRO: профиль документа — вместо жёсткого типа
  profile?: DocumentProfile;
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
  clauseRequirementIds: string[]; // обязательное поле согласно archv2.md
}

export interface ClauseDraft {
  id: string;
  requirementId: string; // PRO: ссылка на ClauseRequirement
  sectionId?: string; // Legacy: для обратной совместимости
  text: string;
  reasoningSummary?: string;
  order: number;
  source: "model" | "user" | "merged"; // PRO: источник текста
  lockedByUser?: boolean; // PRO: заблокирован ли пользователем
  version: number; // PRO: версия пункта
}

export interface LegalDocument {
  id: string;
  mission: LegalDocumentMission;
  // PRO: обязательные поля согласно archv2.md
  profile: DocumentProfile;
  skeleton: DocumentSkeleton;
  clauseRequirements: ClauseRequirement[];
  clauseDrafts: ClauseDraft[];
  finalText: string;
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

// Clause requirements (PRO)
export interface ClauseRequirement {
  id: string;
  sectionId: string;
  title: string; // PRO: название требования
  purpose: string;
  requiredElements: string[];
  recommendedElements: string[];
  relatedIssues: string[]; // Issue IDs (legacy)
  // PRO: новые связи
  relatedDomains?: LegalDomain[];
  relatedBlocks?: LegalBlock[];
  relatedDecisions?: DecisionKey[];
  relatedPartyRoles?: PartyRole[];
  riskNotes?: string;
}

// Question types (PRO)
export type QuestionType = "single_choice" | "multi_choice" | "free_text" | "form";

export interface QuestionOption {
  id: string;
  label: string;
  description?: string;
  legalEffect?: string; // PRO: юридический эффект выбора
  riskLevel?: "low" | "medium" | "high";
  isRecommended?: boolean;
  isMarketStandard?: boolean; // PRO: соответствует ли рыночному стандарту
  requiresInput?: boolean; // If true, show text input field for this option
  inputPlaceholder?: string; // Placeholder text for input field
}

export interface UserQuestion {
  id: string;
  type: QuestionType;
  title: string;
  text: string; // зачем вопрос и что от ответа зависит
  options?: QuestionOption[];
  relatesToSectionId?: string; // к какой секции документа относится
  relatesToClauseId?: string; // к какому пункту относится
  decisionKey?: DecisionKey; // PRO: если вопрос пишет в decisions
  required: boolean; // PRO: обязателен ли вопрос
  legalImpact: string; // кратко: юридические последствия выбора
}

export interface UserAnswer {
  questionId: string;
  selectedOptionIds?: string[];
  freeText?: string;
  formData?: Record<string, any>; // PRO: данные формы для типа "form"
}

// Agent state (PRO) - согласно archv2.md
export interface AgentState {
  conversationId: string;
  documentId: string;
  // PRO: план выполнения и курсор
  plan: PipelineStepId[];
  stepCursor: number;
  // Legacy: для обратной совместимости
  step?: string;
  
  // PRO: обязательные поля на верхнем уровне (archv2.md)
  sizePolicy: DocumentSizePolicy;
  parties: ContractParty[];
  decisions: DecisionsMap;
  
  // PRO: опциональные поля на верхнем уровне
  mission?: LegalDocumentMission;
  profile?: DocumentProfile;
  skeleton?: DocumentSkeleton;
  clauseRequirements?: ClauseRequirement[];
  clauseDrafts?: ClauseDraft[];
  
  // PRO: подсветка секций/пунктов
  highlightedSectionId?: string;
  highlightedClauseId?: string;
  
  // Внутренние данные (usage stats, промежуточные структуры)
  internalData: {
    issues?: Issue[];
    stylePreset?: StylePreset;
    // Usage stats
    totalCost?: number;
    totalTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    lastModel?: string;
    lastAnswer?: UserAnswer;
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

// Agent step result (PRO)
export type AgentStepResult =
  | {
      type: "continue"; // агент сделал шаг, можно сразу продолжать
      state: AgentState;
      documentPatch?: Partial<LegalDocument>;
      chatMessages: ChatMessage[];
      highlightedSectionId?: string; // PRO: подсветка секции
      highlightedClauseId?: string; // PRO: подсветка пункта
    }
  | {
      type: "need_user_input"; // агент остановился и ждёт ответ
      state: AgentState;
      documentPatch?: Partial<LegalDocument>;
      question: UserQuestion;
      chatMessages: ChatMessage[]; // обычно сообщение, объясняющее вопрос
      highlightedSectionId?: string; // PRO: подсветка секции
      highlightedClauseId?: string; // PRO: подсветка пункта
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
  totalCost?: number; // Total cost in USD
  totalTokens?: number; // Total tokens used
  promptTokens?: number; // Total prompt tokens used
  completionTokens?: number; // Total completion tokens used
  lastModel?: string; // Last model used
}

// API request/response types (PRO)
export interface AgentStepRequest {
  conversationId: string; // обязательное поле согласно archv2.md
  userMessage?: string;
  agentState: AgentState | null;
  userAnswer?: UserAnswer;
  documentChanges?: Partial<LegalDocument>;
  documentPatchFromUser?: Partial<LegalDocument>; // PRO: правки пользователя
  reasoningLevel?: ReasoningLevel; // для первого запроса согласно reasoning.md
}

export interface AgentStepResponse {
  result: AgentStepResult;
  totalCost?: number; // Total cost in USD
  totalTokens?: number; // Total tokens used
  promptTokens?: number; // Total prompt tokens used
  completionTokens?: number; // Total completion tokens used
  lastModel?: string; // Last model used
}

