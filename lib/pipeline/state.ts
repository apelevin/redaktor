import { create } from 'zustand';
import type { DocumentState, QAContext, Section, Clause } from '@/types/document';
import type { CostCalculation, TokenUsage } from '@/lib/utils/cost-calculator';

export interface CostRecord {
  step: string;
  model: string;
  usage: TokenUsage;
  cost: CostCalculation;
  timestamp: Date;
}

interface DocumentStore extends DocumentState {
  // Cost tracking
  cost_records: CostRecord[];
  
  // Actions
  setDocumentType: (type: string) => void;
  setJurisdiction: (jurisdiction?: string) => void;
  setStyle: (style?: string) => void;
  addQAContext: (qa: QAContext) => void;
  setSkeleton: (skeleton: Section[]) => void;
  addClause: (clause: Clause) => void;
  updateClause: (id: string, clause: Partial<Clause>) => void;
  setContractVariable: (key: string, value: any) => void;
  addClauseSummary: (summary: string) => void;
  addCostRecord: (step: string, model: string, usage: TokenUsage, cost: CostCalculation) => void;
  getTotalCost: () => number;
  reset: () => void;
}

const initialState: DocumentState & { cost_records: CostRecord[] } = {
  document_type: '',
  jurisdiction: undefined,
  style: undefined,
  qa_context: [],
  skeleton: [],
  clauses: [],
  contract_variables: {},
  clauses_summary: [],
  cost_records: [],
};

export const useDocumentStore = create<DocumentStore>((set) => ({
  ...initialState,
  
  setDocumentType: (type) => set({ document_type: type }),
  
  setJurisdiction: (jurisdiction) => set({ jurisdiction }),
  
  setStyle: (style) => set({ style }),
  
  addQAContext: (qa) => set((state) => ({
    qa_context: [...state.qa_context, qa],
  })),
  
  setSkeleton: (skeleton) => set({ skeleton }),
  
  addClause: (clause) => set((state) => ({
    clauses: [...state.clauses, clause],
  })),
  
  updateClause: (id, updates) => set((state) => ({
    clauses: state.clauses.map(c =>
      c.id === id ? { ...c, ...updates } : c
    ),
  })),
  
  setContractVariable: (key, value) => set((state) => ({
    contract_variables: {
      ...state.contract_variables,
      [key]: value,
    },
  })),
  
  addClauseSummary: (summary) => set((state) => ({
    clauses_summary: [...state.clauses_summary, summary],
  })),
  
  addCostRecord: (step, model, usage, cost) => set((state) => ({
    cost_records: [...state.cost_records, {
      step,
      model,
      usage,
      cost,
      timestamp: new Date(),
    }],
  })),
  
  getTotalCost: () => {
    const state = useDocumentStore.getState();
    const total = state.cost_records.reduce((sum, record) => sum + record.cost.totalCost, 0);
    return total;
  },
  
  reset: () => set(initialState),
}));

