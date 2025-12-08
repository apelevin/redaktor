import type { DocumentMode } from '@/types/document-mode';

/**
 * Универсальная инструкция для генерации документов
 * Создается из готового документа через LLM с анонимизацией
 */
export interface Instruction {
  documentType: string;
  jurisdiction: string;
  whenToUse: string; // 2-5 предложений общего описания ситуации
  requiredUserInputs: string[]; // Уникальные вопросы, сгруппированные по смыслу
  recommendedStructure: InstructionSection[];
  styleHints: StyleHints;
  placeholdersUsed: string[]; // Список всех плейсхолдеров, найденных во входе
  instructionQuality: 'high' | 'medium' | 'low'; // Оценка качества инструкции
  documentMode?: DocumentMode; // Режим, в котором была создана инструкция
}

export interface InstructionSection {
  sectionKey: string;
  title: string;
  description: string; // Короткая суть раздела, без упоминания конкретных данных
  isMandatory: boolean; // true, если без раздела документ юридически неполноценен
}

export interface StyleHints {
  tone: 'neutral_business' | 'formal' | 'friendly' | string;
  riskProfile: 'balanced' | 'conservative' | 'aggressive';
  mustHaveSections: string[]; // sectionKey обязательных разделов
  notes: string[]; // Дополнительные заметки и рекомендации
}

/**
 * Параметры для генерации инструкции
 */
export interface InstructionGenerationParams {
  sanitizedDocument: string; // Обезличенный текст документа
  skeleton: any[]; // Section[] из types/document
  questions: any[]; // Question[] из types/question
  documentType: string;
  jurisdiction: string; // По умолчанию "RU"
}

/**
 * Результат генерации инструкции
 */
export interface InstructionGenerationResult {
  instruction: Instruction;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model?: string;
}

/**
 * Метаданные инструкции для хранения в Pinecone
 * Содержит только плоские поля (string/number), сложные объекты хранятся как JSON-строки
 */
export interface PineconeInstructionMetadata {
  // Ключевые поля для фильтров и быстрых просмотров
  documentType: string;          // человекочитаемое имя типа документа
  jurisdiction: string;          // "RU"
  language: string;              // "ru"
  documentMode: 'short' | 'standard' | 'extended' | 'expert'; // Режим, в котором создана инструкция
  
  whenToUse: string;             // короткое описание (дублирует Instruction.whenToUse)
  instructionQuality: string;    // "high" | "medium" | "low"
  version: number;               // версия инструкции
  usage_count: number;           // сколько раз инструкция уже использовалась
  createdAt: string;             // ISO-строка даты
  
  // Вся полная инструкция в виде JSON-строки
  fullInstruction: string;       // JSON.stringify(Instruction)
}

/**
 * Результат поиска инструкции в Pinecone
 */
export interface InstructionMatch {
  id: string;
  score: number;
  instruction: Instruction;
}

