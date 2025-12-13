'use client';

import { useState } from 'react';
import type { Question } from '@/types/question';

interface SingleChoiceQuestionProps {
  question: Question;
  onSubmit: (answer: string | { option: string; details?: string }, selectedOptionIds: string[]) => void;
}

/**
 * Определяет, является ли опция "положительной" (да/yes/true)
 */
function isPositiveOption(optionValue: string): boolean {
  const positiveValues = ['yes', 'да', 'true', '1', 'y'];
  return positiveValues.includes(optionValue.toLowerCase());
}

export default function SingleChoiceQuestion({ question, onSubmit }: SingleChoiceQuestionProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');
  const [conditionalText, setConditionalText] = useState('');

  // Определяем, выбрана ли положительная опция и нужно ли показывать условное поле
  const selectedOption = question.options?.find(opt => opt.id === selectedOptionId);
  const isPositiveSelected = selectedOption ? isPositiveOption(selectedOption.value) : false;
  const showConditionalField = question.conditionalText && isPositiveSelected && selectedOptionId !== 'other';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOptionId) {
      return;
    }

    const selectedOption = question.options?.find(opt => opt.id === selectedOptionId);
    
    // Если есть условное текстовое поле и оно заполнено
    if (showConditionalField && conditionalText.trim()) {
      const answer = {
        option: selectedOption?.label || otherText,
        details: conditionalText.trim(),
      };
      onSubmit(answer, [selectedOptionId]);
    } else if (selectedOptionId === 'other' && otherText.trim()) {
      // Обычное поле "Другое"
      onSubmit(otherText, [selectedOptionId]);
    } else if (selectedOption) {
      // Обычный выбор опции
      onSubmit(selectedOption.label, [selectedOptionId]);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-gray-700">{question.text}</span>
        {question.isRequired && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      <div className="space-y-2">
        {question.options?.map((option) => (
          <label key={option.id} className="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              name={`question-${question.id}`}
              value={option.id}
              checked={selectedOptionId === option.id}
              onChange={(e) => setSelectedOptionId(e.target.value)}
              className="w-4 h-4 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">{option.label}</span>
            {option.description && (
              <span className="text-xs text-gray-500">({option.description})</span>
            )}
          </label>
        ))}
      </div>

      {showConditionalField && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {question.conditionalTextLabel || 'Опишите детали:'}
            {question.isRequired && <span className="text-red-500 ml-1">*</span>}
          </label>
          <textarea
            value={conditionalText}
            onChange={(e) => setConditionalText(e.target.value)}
            placeholder="Введите детали..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            rows={4}
            required={question.isRequired}
          />
        </div>
      )}

      {question.allowOther && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Другое:
          </label>
          <input
            type="text"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="Введите свой вариант..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            onFocus={() => setSelectedOptionId('other')}
          />
        </div>
      )}

      <button
        type="submit"
        disabled={
          !selectedOptionId || 
          (showConditionalField && question.isRequired && !conditionalText.trim())
        }
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        Отправить
      </button>
    </form>
  );
}

