import { create } from 'zustand';
import type { Question, QuestionAnswer } from '@/types/question';
import type { CompletionState, NextStep } from '@/types/completion';
import type { TokenUsage } from '@/lib/utils/cost-calculator';
import { calculateCost } from '@/lib/utils/cost-calculator';
import type { Section } from '@/types/document';

export interface CostRecord {
  id: string;
  timestamp: Date;
  model: string;
  usage: TokenUsage;
  cost: number;
  operation: string; // 'question_generation' | 'completion_message' | 'skeleton' | 'clause' | 'context_completion'
}

export type PipelineStep = 'step1' | 'step2' | 'step3';

interface DocumentStore {
  documentType: string | null;
  context: Record<string, any>;
  questions: Question[];
  answers: QuestionAnswer[];
  currentQuestionId: string | null;
  completionState: CompletionState | null;
  nextStep: NextStep | null;
  currentStep: PipelineStep;
  generatedContext: string | null; // Полное описание договора, сгенерированное на шаге 2
  skeleton: Section[] | null; // Скелет документа, сгенерированный на шаге 3
  selectedSkeletonItems: Set<string>; // Выбранные пункты скелета (ключ: sectionId-itemIndex)
  skeletonConfirmed: boolean; // Флаг подтверждения структуры
  currentSkeletonItem: { sectionId: string; itemIndex: number } | null; // Текущий пункт, по которому задается вопрос
  skeletonItemAnswers: Record<string, any>; // Ответы по пунктам скелета (ключ: sectionId-itemIndex)
  costRecords: CostRecord[];

  // Actions
  setDocumentType: (type: string | null) => void;
  addAnswer: (answer: QuestionAnswer) => void;
  setCurrentQuestion: (questionId: string | null) => void;
  addQuestion: (question: Question) => void;
  updateContext: (updates: Record<string, any>) => void;
  setCompletionState: (state: CompletionState | null) => void;
  setNextStep: (step: NextStep | null) => void;
  setCurrentStep: (step: PipelineStep) => void;
  setGeneratedContext: (context: string | null) => void;
  setSkeleton: (skeleton: Section[]) => void;
  toggleSkeletonItem: (sectionId: string, itemIndex: number) => void;
  selectAllSkeletonItems: (sectionId?: string) => void;
  deselectAllSkeletonItems: (sectionId?: string) => void;
  confirmSkeleton: () => void;
  setCurrentSkeletonItem: (item: { sectionId: string; itemIndex: number } | null) => void;
  addSkeletonItemAnswer: (sectionId: string, itemIndex: number, answer: any) => void;
  addCostRecord: (model: string, usage: TokenUsage, operation: string) => void;
  reset: () => void;
  
}

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  documentType: null,
  context: {},
  questions: [],
  answers: [],
  currentQuestionId: null,
  completionState: null,
  nextStep: null,
  currentStep: 'step1',
  generatedContext: null,
  skeleton: null,
  selectedSkeletonItems: new Set<string>(),
  skeletonConfirmed: false,
  currentSkeletonItem: null,
  skeletonItemAnswers: {},
  costRecords: [],

  setDocumentType: (type) => set({ 
    documentType: type, 
    context: {}, 
    answers: [], 
    questions: [], 
    currentQuestionId: null,
    completionState: null,
    nextStep: null,
    currentStep: 'step1',
    generatedContext: null,
    skeleton: null,
    selectedSkeletonItems: new Set<string>(),
    skeletonConfirmed: false,
    currentSkeletonItem: null,
    skeletonItemAnswers: {},
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

  setCurrentStep: (step) => set({ currentStep: step }),

  setGeneratedContext: (context) => set({ generatedContext: context }),

  setSkeleton: (skeleton) => {
    set({ skeleton, selectedSkeletonItems: new Set<string>() });
  },

  toggleSkeletonItem: (sectionId, itemIndex) => {
    const key = `${sectionId}-${itemIndex}`;
    set((state) => {
      const newSet = new Set(state.selectedSkeletonItems);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return { selectedSkeletonItems: newSet };
    });
  },

  selectAllSkeletonItems: (sectionId) => {
    set((state) => {
      if (!state.skeleton) return state;
      const newSet = new Set(state.selectedSkeletonItems);
      
      if (sectionId) {
        // Выбрать все в конкретной секции
        const section = state.skeleton.find((s) => s.id === sectionId);
        if (section) {
          section.items.forEach((_, index) => {
            newSet.add(`${sectionId}-${index}`);
          });
        }
      } else {
        // Выбрать все во всех секциях
        state.skeleton.forEach((section) => {
          section.items.forEach((_, index) => {
            newSet.add(`${section.id}-${index}`);
          });
        });
      }
      return { selectedSkeletonItems: newSet };
    });
  },

  deselectAllSkeletonItems: (sectionId) => {
    set((state) => {
      if (!state.skeleton) return state;
      const newSet = new Set(state.selectedSkeletonItems);
      
      if (sectionId) {
        // Снять выбор со всех в конкретной секции
        const section = state.skeleton.find((s) => s.id === sectionId);
        if (section) {
          section.items.forEach((_, index) => {
            newSet.delete(`${sectionId}-${index}`);
          });
        }
      } else {
        // Снять выбор со всех секций
        newSet.clear();
      }
      return { selectedSkeletonItems: newSet };
    });
  },

  confirmSkeleton: () => set({ skeletonConfirmed: true }),

  setCurrentSkeletonItem: (item) => set({ currentSkeletonItem: item }),

  addSkeletonItemAnswer: (sectionId, itemIndex, answer) => {
    const key = `${sectionId}-${itemIndex}`;
    set((state) => ({
      skeletonItemAnswers: { ...state.skeletonItemAnswers, [key]: answer },
    }));
  },

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
    currentStep: 'step1',
    generatedContext: null,
    skeleton: null,
    selectedSkeletonItems: new Set<string>(),
    skeletonConfirmed: false,
    currentSkeletonItem: null,
    skeletonItemAnswers: {},
    costRecords: [],
  }),
}));

// Селектор для вычисления totalCost
export const useTotalCost = () => {
  const costRecords = useDocumentStore((state) => state.costRecords);
  return costRecords.reduce((sum, record) => sum + record.cost, 0);
};

// Селектор для вычисления canGenerateContract
export const useCanGenerateContract = () => {
  const completionState = useDocumentStore((state) => state.completionState);
  return completionState?.mustCompleted ?? false;
};

