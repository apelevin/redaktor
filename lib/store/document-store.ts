import { create } from 'zustand';
import type { Question, QuestionAnswer } from '@/types/question';
import type { CompletionState, NextStep } from '@/types/completion';
import type { TokenUsage } from '@/lib/utils/cost-calculator';
import { calculateCost } from '@/lib/utils/cost-calculator';

export interface CostRecord {
  id: string;
  timestamp: Date;
  model: string;
  usage: TokenUsage;
  cost: number;
  operation: string; // 'question_generation' | 'completion_message' | 'skeleton' | 'clause' | 'context_completion'
}

interface DocumentStore {
  documentType: string | null;
  context: Record<string, any>;
  questions: Question[];
  answers: QuestionAnswer[];
  currentQuestionId: string | null;
  completionState: CompletionState | null;
  nextStep: NextStep | null;
  costRecords: CostRecord[];

  // Actions
  setDocumentType: (type: string | null) => void;
  addAnswer: (answer: QuestionAnswer) => void;
  setCurrentQuestion: (questionId: string | null) => void;
  addQuestion: (question: Question) => void;
  updateContext: (updates: Record<string, any>) => void;
  setCompletionState: (state: CompletionState | null) => void;
  setNextStep: (step: NextStep | null) => void;
  addCostRecord: (model: string, usage: TokenUsage, operation: string) => void;
  reset: () => void;
  
  // Computed
  totalCost: number;
}

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  documentType: null,
  context: {},
  questions: [],
  answers: [],
  currentQuestionId: null,
  completionState: null,
  nextStep: null,
  costRecords: [],

  setDocumentType: (type) => set({ 
    documentType: type, 
    context: {}, 
    answers: [], 
    questions: [], 
    currentQuestionId: null,
    completionState: null,
    nextStep: null,
    costRecords: [], // Сбрасываем затраты при новом документе
  }),

  addAnswer: (answer) => set((state) => ({
    answers: [...state.answers, answer],
  })),

  setCurrentQuestion: (questionId) => set({ currentQuestionId: questionId }),

  addQuestion: (question) => set((state) => ({
    questions: [...state.questions, question],
  })),

  updateContext: (updates) => set((state) => ({
    context: { ...state.context, ...updates },
  })),

  setCompletionState: (state) => set({ completionState: state }),

  setNextStep: (step) => set({ nextStep: step }),

  addCostRecord: (model, usage, operation) => {
    const cost = calculateCost(model, usage).totalCost;
    const record: CostRecord = {
      id: `cost-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      model,
      usage,
      cost,
      operation,
    };
    set((state) => ({
      costRecords: [...state.costRecords, record],
    }));
  },

  reset: () => set({
    documentType: null,
    context: {},
    questions: [],
    answers: [],
    currentQuestionId: null,
    completionState: null,
    nextStep: null,
    costRecords: [],
  }),

  get totalCost() {
    const records = get().costRecords;
    return records.reduce((sum, record) => sum + record.cost, 0);
  },
}));

// Селектор для вычисления canGenerateContract
export const useCanGenerateContract = () => {
  const completionState = useDocumentStore((state) => state.completionState);
  return completionState?.mustCompleted ?? false;
};

