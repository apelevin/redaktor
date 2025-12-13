'use client';

import { useState } from 'react';
import { AskUserAction } from '@/lib/types';

interface QuestionFormProps {
  question: AskUserAction;
  onSubmit: (answer: string) => void;
  isLoading: boolean;
}

export default function QuestionForm({ question, onSubmit, isLoading }: QuestionFormProps) {
  const [selectedChoices, setSelectedChoices] = useState<string[]>([]);
  const [freeText, setFreeText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (question.answer_format === 'choices') {
      if (selectedChoices.length === 0) {
        alert('Пожалуйста, выберите вариант ответа');
        return;
      }
      // Для choices отправляем выбранные значения
      const selectedValues = question.choices
        ?.filter((c) => selectedChoices.includes(c.id))
        .map((c) => String(c.value))
        .join(', ') || '';
      onSubmit(selectedValues);
    } else {
      if (!freeText.trim()) {
        alert('Пожалуйста, введите ответ');
        return;
      }
      onSubmit(freeText);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: '15px' }}>
        <div style={{ 
          padding: '12px', 
          backgroundColor: '#e7f3ff', 
          borderRadius: '8px',
          marginBottom: '15px'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
            {question.question_text}
          </div>
          {question.why_this_question && (
            <div style={{ fontSize: '14px', color: '#666', marginTop: '5px' }}>
              <em>{question.why_this_question}</em>
            </div>
          )}
        </div>

        {question.answer_format === 'choices' && question.choices ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {question.choices.map((choice) => (
              <label
                key={choice.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  backgroundColor: selectedChoices.includes(choice.id) ? '#e7f3ff' : '#fff',
                }}
              >
                <input
                  type={question.answer_format === 'choices' ? 'radio' : 'checkbox'}
                  checked={selectedChoices.includes(choice.id)}
                  onChange={(e) => {
                    if (question.answer_format === 'choices') {
                      setSelectedChoices([choice.id]);
                    } else {
                      if (e.target.checked) {
                        setSelectedChoices([...selectedChoices, choice.id]);
                      } else {
                        setSelectedChoices(selectedChoices.filter((id) => id !== choice.id));
                      }
                    }
                  }}
                  style={{ marginRight: '10px' }}
                />
                <div>
                  <div style={{ fontWeight: 'bold' }}>{choice.label}</div>
                  {choice.value !== choice.label && (
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      Значение: {String(choice.value)}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        ) : (
          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="Введите ваш ответ..."
            rows={4}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              fontFamily: 'inherit',
              border: '1px solid #ddd',
              borderRadius: '8px',
              resize: 'vertical',
            }}
            disabled={isLoading}
          />
        )}
      </div>

      <button
        type="submit"
        disabled={isLoading || (question.answer_format === 'choices' && selectedChoices.length === 0) || (question.answer_format === 'free_text' && !freeText.trim())}
        style={{
          width: '100%',
          padding: '12px',
          fontSize: '16px',
          fontWeight: 'bold',
          backgroundColor: isLoading ? '#ccc' : '#007bff',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: isLoading ? 'not-allowed' : 'pointer',
        }}
      >
        {isLoading ? 'Отправка...' : 'Отправить'}
      </button>
    </form>
  );
}
