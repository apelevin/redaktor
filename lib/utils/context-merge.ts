import type { Question, QuestionAnswer } from '@/types/question';

/**
 * Мерджит ответ пользователя в контекст документа
 * Пока простое сохранение: добавляет raw ответ в контекст по ключу questionId
 * В будущем здесь будет нормализация через LLM
 */
export function mergeAnswerToContext(
  context: Record<string, any>,
  answer: QuestionAnswer,
  question: Question
): Record<string, any> {
  // Обрабатываем разные типы ответов
  let valueToStore: any = answer.raw;
  
  // Если это условный ответ (объект с option и details)
  if (
    typeof answer.raw === 'object' &&
    !Array.isArray(answer.raw) &&
    'option' in answer.raw
  ) {
    // Сохраняем структурированный объект
    valueToStore = {
      option: answer.raw.option,
      details: answer.raw.details || null,
    };
  }
  
  // Пока просто сохраняем raw ответ по questionId
  // В будущем здесь будет нормализация через LLM и заполнение полей из question.affects
  const newContext = {
    ...context,
    [answer.questionId]: valueToStore,
  };

  // TODO: Реализовать нормализацию через LLM и заполнение полей из question.affects
  // Например, если question.affects = ['payment.model'], то нужно:
  // 1. Отправить raw ответ в LLM с промптом на нормализацию
  // 2. Получить структурированные данные
  // 3. Заполнить context.payment.model

  return newContext;
}

