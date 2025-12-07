import type { Question } from '@/types/question';

/**
 * Проверяет, выполнены ли все зависимости вопроса
 */
function areDependenciesMet(
  question: Question,
  context: Record<string, any>
): boolean {
  if (!question.dependsOn || question.dependsOn.length === 0) {
    return true;
  }

  return question.dependsOn.every((path) => {
    // Простая проверка наличия пути в контексте
    // В будущем можно улучшить для поддержки вложенных путей (dot-notation)
    const keys = path.split('.');
    let current: any = context;
    
    for (const key of keys) {
      if (current === undefined || current === null || !(key in current)) {
        return false;
      }
      current = current[key];
    }
    
    return current !== undefined && current !== null;
  });
}

/**
 * Выбирает следующий вопрос из списка доступных
 */
export function selectNextQuestion(
  questions: Question[],
  context: Record<string, any>,
  answeredQuestionIds: string[]
): Question | null {
  // Фильтруем вопросы:
  // 1. Проверяем dependsOn - все зависимости должны быть в context
  // 2. Исключаем уже отвеченные
  const availableQuestions = questions.filter((question) => {
    const isDependencyMet = areDependenciesMet(question, context);
    const isNotAnswered = !answeredQuestionIds.includes(question.id);
    return isDependencyMet && isNotAnswered;
  });

  if (availableQuestions.length === 0) {
    return null;
  }

  // Сортируем по order (если есть)
  const sorted = availableQuestions.sort((a, b) => {
    const orderA = a.order ?? Infinity;
    const orderB = b.order ?? Infinity;
    return orderA - orderB;
  });

  return sorted[0];
}


