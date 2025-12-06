import type { Question } from './question';

export interface CompletionState {
  mustTotal: number;
  mustAnswered: number;
  recommendedTotal: number;
  recommendedAnswered: number;
  optionalTotal: number;
  optionalAnswered: number;

  mustCompleted: boolean;          // mustAnswered === mustTotal
  recommendedCoverage: number;     // 0..1
  overallCoverage: number;         // взвешенный показатель
}

export type NextStep =
  | { kind: 'askMore'; questions: Question[] }
  | { kind: 'generateContract' }
  | { kind: 'offerChoice'; message: string; summaryTopics: string[]; questions: Question[] };

export interface CompletionMessage {
  message: string;
  summaryTopics: string[];
  buttons: Array<{ id: string; label: string }>;
}

