'use client';

import { useState } from 'react';
import type { Question } from '@/types/question';

interface OpenQuestionProps {
  question: Question;
  onSubmit: (answer: string) => void;
}

export default function OpenQuestion({ question, onSubmit }: OpenQuestionProps) {
  const [answer, setAnswer] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (question.isRequired && !answer.trim()) {
      return;
    }
    onSubmit(answer);
    setAnswer('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-gray-700">{question.text}</span>
        {question.isRequired && <span className="text-red-500 ml-1">*</span>}
      </label>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Введите ваш ответ..."
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        rows={4}
        required={question.isRequired}
      />
      <button
        type="submit"
        disabled={question.isRequired && !answer.trim()}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        Отправить
      </button>
    </form>
  );
}


