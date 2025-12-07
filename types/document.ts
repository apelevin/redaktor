export interface QAContext {
  question: string;
  answer: string;
}

import type { ItemImportance } from './document-mode';

export interface SkeletonItem {
  text: string;
  importance?: ItemImportance;
}

export interface Section {
  id: string;
  title: string;
  items: SkeletonItem[] | string[]; // Поддержка обратной совместимости: string[] или новый формат с importance
}

export interface Clause {
  id: string;
  sectionId: string;
  content: string;
  source: 'rag' | 'llm';
  metadata?: {
    sourceType?: 'template' | 'law' | 'case';
    sourceReference?: string;
    assumptions?: string[];
    relatedNorms?: string[];
  };
}

export interface ContractVariable {
  key: string;
  value: any;
  type: 'string' | 'number' | 'date' | 'boolean';
}

export interface DocumentState {
  document_type: string;
  jurisdiction?: string;
  style?: string;
  qa_context: QAContext[];
  skeleton: Section[];
  clauses: Clause[];
  contract_variables: Record<string, any>;
  clauses_summary: string[];
}

export interface InstructionResult {
  instruction_found: boolean;
  skeleton?: Section[];
  questions?: string[];
  related_norms?: string[];
}

export interface ClauseSearchResult {
  clause_found: boolean;
  clause?: Clause;
  metadata?: any;
}

export interface InstructionMetadata {
  document_type: string;
  style: string;
  skeleton_id: string;
  source_doc_id: string;
  approved: boolean;
  version: number;
  usage_count: number;
}

export interface ClauseMetadata {
  document_type: string;
  style: string;
  section_path: string;
  source_doc_id: string;
  approved: boolean;
  quality_score: number;
  [key: string]: any; // для опциональных переменных
}

