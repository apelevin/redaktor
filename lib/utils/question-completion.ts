import type { Question } from '@/types/question';
import type { CompletionState, NextStep } from '@/types/completion';

/**
 * Получает значение из объекта по пути (dot-notation)
 */
function getValue(obj: any, path: string): any {
  const keys = path.split('.');
  let current: any = obj;
  
  for (const key of keys) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[key];
  }
  
  return current;
}

/**
 * Проверяет, заполнен ли вопрос (все пути из affects имеют не-пустые значения)
 */
export function isQuestionAnswered(
  question: Question,
  context: Record<string, any>
): boolean {
  return question.affects.every((path) => {
    const value = getValue(context, path);
    return value !== undefined && value !== null && value !== '';
  });
}

/**
 * Вычисляет состояние заполненности контекста
 */
export function calcCompletionState(
  questions: Question[],
  context: Record<string, any>
): CompletionState {
  const state: CompletionState = {
    mustTotal: 0,
    mustAnswered: 0,
    recommendedTotal: 0,
    recommendedAnswered: 0,
    optionalTotal: 0,
    optionalAnswered: 0,
    mustCompleted: false,
    recommendedCoverage: 0,
    overallCoverage: 0,
  };

  for (const q of questions) {
    const answered = isQuestionAnswered(q, context);
    
    // Определяем уровень важности: используем requiredLevel, если есть, иначе маппим isRequired
    const level = q.requiredLevel || (q.isRequired ? 'must' : 'optional');
    
    if (level === 'must') {
      state.mustTotal += 1;
      if (answered) state.mustAnswered += 1;
    } else if (level === 'recommended') {
      state.recommendedTotal += 1;
      if (answered) state.recommendedAnswered += 1;
    } else {
      state.optionalTotal += 1;
      if (answered) state.optionalAnswered += 1;
    }
  }

  state.mustCompleted = state.mustTotal > 0 && state.mustAnswered === state.mustTotal;
  state.recommendedCoverage =
    state.recommendedTotal === 0 ? 1 : state.recommendedAnswered / state.recommendedTotal;

  // Простой общий скор: must*0.6 + recommended*0.3 + optional*0.1
  const mustScore =
    state.mustTotal === 0 ? 1 : state.mustAnswered / state.mustTotal;
  const optScore =
    state.optionalTotal === 0 ? 1 : state.optionalAnswered / state.optionalTotal;

  state.overallCoverage =
    mustScore * 0.6 +
    state.recommendedCoverage * 0.3 +
    optScore * 0.1;

  return state;
}

/**
 * Определяет следующий шаг на основе состояния заполненности
 */
export function decideNextStep(
  state: CompletionState,
  questions: Question[],
  context: Record<string, any>
): NextStep {
  if (!state.mustCompleted) {
    // Ищем следующий обязательный вопрос
    const nextMust = questions.find(
      (q) => {
        const level = q.requiredLevel || (q.isRequired ? 'must' : 'optional');
        return level === 'must' && !isQuestionAnswered(q, context);
      }
    );
    return { kind: 'askMore', questions: nextMust ? [nextMust] : [] };
  }

  // must закрыты: можно генерировать договор
  const remainingRecommended = questions.filter((q) => {
    const level = q.requiredLevel || (q.isRequired ? 'must' : 'optional');
    return level === 'recommended' && !isQuestionAnswered(q, context);
  });

  if (remainingRecommended.length === 0) {
    // Вообще нечего уточнять
    return { kind: 'generateContract' };
  }

  // Есть что уточнить — предлагаем выбор пользователю
  // Берем топ-3-5 вопросов (можно сортировать по order или importanceScore)
  const sorted = remainingRecommended.sort((a, b) => {
    const orderA = a.order ?? Infinity;
    const orderB = b.order ?? Infinity;
    return orderA - orderB;
  });
  
  const topQuestions = sorted.slice(0, 5);
  return { kind: 'askMore', questions: topQuestions };
}

