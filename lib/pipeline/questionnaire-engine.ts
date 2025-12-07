/**
 * Questionnaire Engine - логика работы с опросниками
 * Поддерживает Warm Start (готовые опросники из Pinecone)
 */

import type { QuestionTemplate, AnswerValue } from './types';
import type { QAContext } from '@/types/document';

/**
 * Получить следующий вопрос из опросника
 * @param questionnaire Массив шаблонов вопросов
 * @param qa_context История вопросов и ответов
 * @returns Следующий вопрос или null, если все вопросы покрыты
 */
export function getNextQuestionFromQuestionnaire(
  questionnaire: QuestionTemplate[],
  qa_context: QAContext[]
): QuestionTemplate | null {
  // Создаем Set из ID вопросов, на которые уже есть ответы
  const answeredQuestionIds = new Set(
    qa_context
      .filter(qa => qa.questionId)
      .map(qa => qa.questionId!)
  );

  // Находим все required вопросы без ответов
  const unansweredRequired = questionnaire
    .filter(q => q.required && !answeredQuestionIds.has(q.id))
    .sort((a, b) => a.order - b.order);

  // Если есть обязательные вопросы без ответов - возвращаем следующий
  if (unansweredRequired.length > 0) {
    return unansweredRequired[0];
  }

  // Если все обязательные покрыты, можно вернуть опциональный
  const unansweredOptional = questionnaire
    .filter(q => !q.required && !answeredQuestionIds.has(q.id))
    .sort((a, b) => a.order - b.order);

  if (unansweredOptional.length > 0) {
    return unansweredOptional[0];
  }

  // Все вопросы покрыты
  return null;
}

/**
 * Проверить, завершен ли опросник (все required вопросы имеют ответы)
 * @param questionnaire Массив шаблонов вопросов
 * @param qa_context История вопросов и ответов
 * @returns true если все required вопросы покрыты
 */
export function checkQuestionnaireCompletion(
  questionnaire: QuestionTemplate[],
  qa_context: QAContext[]
): boolean {
  // Создаем Set из ID вопросов, на которые есть ответы
  const answeredQuestionIds = new Set(
    qa_context
      .filter(qa => qa.questionId)
      .map(qa => qa.questionId!)
  );

  // Проверяем, что все required вопросы имеют ответы
  const requiredQuestions = questionnaire.filter(q => q.required);
  const allRequiredAnswered = requiredQuestions.every(
    q => answeredQuestionIds.has(q.id)
  );

  return allRequiredAnswered;
}

/**
 * Получить ответ на вопрос по его ID
 * @param questionId ID вопроса
 * @param qa_context История вопросов и ответов
 * @returns Ответ или undefined
 */
export function getAnswerByQuestionId(
  questionId: string,
  qa_context: QAContext[]
): AnswerValue | undefined {
  const qa = qa_context.find(qa => qa.questionId === questionId);
  return qa?.answer;
}


