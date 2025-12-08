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

