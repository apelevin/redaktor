import type { Question, QuestionAnswer } from '@/types/question';

/**
 * Устанавливает значение в объект по пути (dot-notation)
 */
function setValue(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key];
  }
  
  current[keys[keys.length - 1]] = value;
}

/**
 * Мерджит ответ пользователя в контекст документа
 * Заполняет пути из question.affects значениями из ответа
 */
export function mergeAnswerToContext(
  context: Record<string, any>,
  answer: QuestionAnswer,
  question: Question
): Record<string, any> {
  const newContext = { ...context };
  
  // Определяем значение для сохранения
  let valueToStore: any = answer.raw;
  
  // Для single-choice вопросов: если выбран option, берем его value
  if (question.uiKind === 'single' && question.options && answer.selectedOptionIds && answer.selectedOptionIds.length > 0) {
    const selectedOptionId = answer.selectedOptionIds[0];
    const selectedOption = question.options.find(opt => opt.id === selectedOptionId);
    if (selectedOption) {
      valueToStore = selectedOption.value;
    }
  }
  
  // Для multi-choice вопросов: берем values всех выбранных опций
  if (question.uiKind === 'multi' && question.options && answer.selectedOptionIds && answer.selectedOptionIds.length > 0) {
    valueToStore = answer.selectedOptionIds
      .map(id => question.options?.find(opt => opt.id === id)?.value)
      .filter(Boolean);
  }
  
  // Если это условный ответ (объект с option и details)
  if (
    typeof answer.raw === 'object' &&
    !Array.isArray(answer.raw) &&
    'option' in answer.raw
  ) {
    // Для условных ответов сохраняем option как значение
    valueToStore = answer.raw.option;
    // Если есть details, можно сохранить их отдельно (пока не реализовано)
  }
  
  // Заполняем все пути из question.affects
  if (question.affects && question.affects.length > 0) {
    for (const path of question.affects) {
      setValue(newContext, path, valueToStore);
    }
  }
  
  // Также сохраняем raw ответ по questionId для обратной совместимости
  newContext[answer.questionId] = answer.raw;

  return newContext;
}

