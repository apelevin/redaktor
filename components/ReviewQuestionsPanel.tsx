'use client';

import { useState } from 'react';
import { ReviewQuestion, SkeletonReviewAnswer } from '@/lib/types';
import ReviewQuestionForm from './ReviewQuestionForm';

interface ReviewQuestionsPanelProps {
  questions: ReviewQuestion[];
  answers: SkeletonReviewAnswer[];
  onSubmit: (answers: SkeletonReviewAnswer[]) => void;
  isSubmitting?: boolean;
}

export default function ReviewQuestionsPanel({
  questions,
  answers: existingAnswers,
  onSubmit,
  isSubmitting = false,
}: ReviewQuestionsPanelProps) {
  const [localAnswers, setLocalAnswers] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const answer of existingAnswers) {
      initial[answer.question_id] = answer.value;
    }
    return initial;
  });

  const sortedQuestions = [...questions].sort((a, b) => a.priority - b.priority);

  const handleAnswerChange = (questionId: string, value: unknown) => {
    setLocalAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleSubmit = () => {
    if (isSubmitting) {
      return; // Предотвращаем повторную отправку
    }
    
    const newAnswers: SkeletonReviewAnswer[] = sortedQuestions
      .filter((q) => {
        const value = localAnswers[q.question_id];
        // Пропускаем пустые значения для необязательных вопросов
        if (!q.required && (value === null || value === undefined || value === '')) {
          return false;
        }
        return true;
      })
      .map((q) => ({
        question_id: q.question_id,
        value: localAnswers[q.question_id] ?? null,
        at: new Date().toISOString(),
      }));

    if (newAnswers.length === 0) {
      console.warn('No answers to submit');
      return;
    }

    onSubmit(newAnswers);
  };

  const isFormValid = () => {
    for (const question of sortedQuestions) {
      if (question.required) {
        const value = localAnswers[question.question_id];
        if (value === null || value === undefined || value === '' || 
            (Array.isArray(value) && value.length === 0)) {
          return false;
        }
      }
    }
    return true;
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ marginBottom: '20px' }}>Настройка структуры договора</h2>
      
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f0f9ff', borderRadius: '8px' }}>
        <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
          Ответьте на вопросы ниже, чтобы настроить структуру договора. Вы можете включить/исключить разделы, выбрать уровень детализации и указать необходимые параметры.
        </p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        {sortedQuestions.map((question) => (
          <ReviewQuestionForm
            key={question.question_id}
            question={question}
            value={localAnswers[question.question_id] ?? (question.ux.type === 'checkbox_group' ? [] : null)}
            onChange={(value) => handleAnswerChange(question.question_id, value)}
          />
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button
          onClick={handleSubmit}
          disabled={!isFormValid() || isSubmitting}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: 'bold',
            backgroundColor: isFormValid() && !isSubmitting ? '#007bff' : '#ccc',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: isFormValid() && !isSubmitting ? 'pointer' : 'not-allowed',
            opacity: isSubmitting ? 0.6 : 1,
          }}
        >
          {isSubmitting ? 'Применение...' : 'Применить ответы'}
        </button>
      </div>

      {!isFormValid() && (
        <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#fff3cd', borderRadius: '4px', color: '#856404' }}>
          Пожалуйста, заполните все обязательные поля (отмечены звездочкой *)
        </div>
      )}
    </div>
  );
}
