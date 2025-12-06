export type QuestionUiKind = 'open' | 'single' | 'multi';

export type ValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'enum[]'
  | 'date'
  | 'money';

export interface QuestionOption {
  id: string;           // стабильный ID для логики и хранения
  label: string;        // текст в UI
  value: string;        // машинно-читаемое значение
  description?: string; // подсказка для пользователя (необязательно)
}

export interface Question {
  id: string;                // уникальный ID вопроса
  documentType: string;      // тип документа (service_contract, nda и т.д.)

  text: string;              // формулировка вопроса для пользователя
  uiKind: QuestionUiKind;    // open | single | multi
  valueType: ValueType;      // enum, enum[], string и т.д.

  isRequired: boolean;       // обязателен ли вопрос для генерации документа

  options?: QuestionOption[]; // варианты ответа (для single/multi)
  allowOther?: boolean;       // можно ли дописать свой вариант (поле "Другое")

  // Условное текстовое поле для single вопросов
  // Если true, то при выборе положительной опции (yes/да) показывается текстовое поле
  conditionalText?: boolean;
  conditionalTextLabel?: string; // кастомная подпись для условного текстового поля

  // Зависимости: какие другие поля/вопросы должны быть уже заполнены,
  // чтобы этот вопрос стал "активным" и мог быть задан.
  dependsOn?: string[];      // например: ['parties.executor.type']

  // На какие поля контекста влияет этот ответ.
  // Путь в JSON-контексте документа (dot-notation).
  affects: string[];         // например ['payment.model']

  // Необязательный приоритет/порядок внутри дерева вопросов,
  // используется как дефолтный порядок, если не вмешивается LLM.
  order?: number;
}

// Ответ может быть строкой, массивом строк, или объектом с опцией и деталями (для условных полей)
export type RawAnswer = 
  | string 
  | string[] 
  | { option: string; details?: string }; // для условных текстовых полей

export interface NormalizedAnswer {
  // Структура под нужные поля контекста.
  // Ключи и вложенность соответствуют путям из Question.affects.
  [key: string]: any;
}

export interface QuestionAnswer {
  questionId: string;

  raw: RawAnswer;                // сырой ответ пользователя

  // Для single/multi – какие опции были выбраны по ID.
  // Для open-ответов может быть пусто.
  selectedOptionIds?: string[];

  // Нормализованный ответ в структуру контекста документа.
  // Пока пустой объект, нормализация через LLM будет добавлена позже
  normalized: NormalizedAnswer;
}

