'use client';

import { useState } from 'react';
import type { Question } from '@/types/question';

interface MultiChoiceQuestionProps {
  question: Question;
  onSubmit: (answer: string[], selectedOptionIds: string[]) => void;
}

export default function MultiChoiceQuestion({ question, onSubmit }: MultiChoiceQuestionProps) {
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [otherTexts, setOtherTexts] = useState<string[]>(['']);

  const handleOptionToggle = (optionId: string) => {
    setSelectedOptionIds((prev) =>
      prev.includes(optionId)
        ? prev.filter((id) => id !== optionId)
        : [...prev, optionId]
    );
  };

  const handleAddOther = () => {
    setOtherTexts((prev) => [...prev, '']);
  };

  const handleOtherTextChange = (index: number, value: string) => {
    setOtherTexts((prev) => {
      const newTexts = [...prev];
      newTexts[index] = value;
      return newTexts;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedOptionIds.length === 0 && otherTexts.every(t => !t.trim())) {
      return;
    }

    const selectedLabels = question.options
      ?.filter(opt => selectedOptionIds.includes(opt.id))
      .map(opt => opt.label) || [];
    
    const allAnswers = [...selectedLabels, ...otherTexts.filter(t => t.trim())];
    onSubmit(allAnswers, selectedOptionIds);
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
              type="checkbox"
              checked={selectedOptionIds.includes(option.id)}
              onChange={() => handleOptionToggle(option.id)}
              className="w-4 h-4 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">{option.label}</span>
            {option.description && (
              <span className="text-xs text-gray-500">({option.description})</span>
            )}
          </label>
        ))}
      </div>

      {question.allowOther && (
        <div className="mt-4 space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Другие варианты:
          </label>
          {otherTexts.map((text, index) => (
            <input
              key={index}
              type="text"
              value={text}
              onChange={(e) => handleOtherTextChange(index, e.target.value)}
              placeholder="Введите свой вариант..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          ))}
          <button
            type="button"
            onClick={handleAddOther}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            + Добавить еще вариант
          </button>
        </div>
      )}

      <button
        type="submit"
        disabled={selectedOptionIds.length === 0 && otherTexts.every(t => !t.trim())}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        Отправить
      </button>
    </form>
  );
}

