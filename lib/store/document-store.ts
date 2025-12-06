import { create } from 'zustand';
import type { Question, QuestionAnswer } from '@/types/question';

interface DocumentStore {
  documentType: string | null;
  context: Record<string, any>;
  questions: Question[];
  answers: QuestionAnswer[];
  currentQuestionId: string | null;

  // Actions
  setDocumentType: (type: string | null) => void;
  addAnswer: (answer: QuestionAnswer) => void;
  setCurrentQuestion: (questionId: string | null) => void;
  addQuestion: (question: Question) => void;
  updateContext: (updates: Record<string, any>) => void;
  reset: () => void;
}

export const useDocumentStore = create<DocumentStore>((set) => ({
  documentType: null,
  context: {},
  questions: [],
  answers: [],
  currentQuestionId: null,

  setDocumentType: (type) => set({ documentType: type, context: {}, answers: [], questions: [], currentQuestionId: null }),

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

  reset: () => set({
    documentType: null,
    context: {},
    questions: [],
    answers: [],
    currentQuestionId: null,
  }),
}));

