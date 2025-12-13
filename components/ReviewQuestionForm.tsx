'use client';

import { useState } from 'react';
import { ReviewQuestion } from '@/lib/types';

interface ReviewQuestionFormProps {
  question: ReviewQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
  errors?: string[];
}

export default function ReviewQuestionForm({
  question,
  value,
  onChange,
  errors = [],
}: ReviewQuestionFormProps) {
  const [localValue, setLocalValue] = useState<unknown>(value);

  const handleChange = (newValue: unknown) => {
    setLocalValue(newValue);
    onChange(newValue);
  };

  const renderInput = () => {
    switch (question.ux.type) {
      case 'checkbox_group':
        if (!question.ux.options) return null;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {question.ux.options.map((option) => {
              const isChecked = Array.isArray(localValue) && localValue.includes(option.value);
              return (
                <label
                  key={option.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    backgroundColor: isChecked ? '#e7f3ff' : '#fff',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      const currentValues = Array.isArray(localValue) ? [...localValue] : [];
                      if (e.target.checked) {
                        if (!currentValues.includes(option.value)) {
                          currentValues.push(option.value);
                        }
                      } else {
                        const index = currentValues.indexOf(option.value);
                        if (index > -1) {
                          currentValues.splice(index, 1);
                        }
                      }
                      handleChange(currentValues);
                    }}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        );

      case 'radio_group':
        if (!question.ux.options) return null;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {question.ux.options.map((option) => (
              <label
                key={option.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  backgroundColor: localValue === option.value ? '#e7f3ff' : '#fff',
                }}
              >
                <input
                  type="radio"
                  name={question.question_id}
                  value={String(option.value)}
                  checked={localValue === option.value}
                  onChange={() => handleChange(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        );

      case 'text_input':
        return (
          <input
            type="text"
            value={typeof localValue === 'string' ? localValue : ''}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={question.ux.placeholder}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
            }}
            maxLength={question.constraints?.max_length}
          />
        );

      case 'number_input':
        return (
          <input
            type="number"
            value={typeof localValue === 'number' ? localValue : ''}
            onChange={(e) => {
              const numValue = e.target.value ? parseFloat(e.target.value) : null;
              handleChange(numValue);
            }}
            placeholder={question.ux.placeholder}
            min={question.constraints?.min}
            max={question.constraints?.max}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          />
        );

      case 'multi_text':
        if (!question.ux.fields) return null;
        const fieldValues = typeof localValue === 'object' && localValue !== null && !Array.isArray(localValue)
          ? localValue as Record<string, unknown>
          : {};
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {question.ux.fields.map((field) => (
              <div key={field.id}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                  {field.label}
                  {field.required && <span style={{ color: 'red' }}> *</span>}
                </label>
                <input
                  type={field.input_type}
                  value={String(fieldValues[field.id] || '')}
                  onChange={(e) => {
                    const newFieldValues = { ...fieldValues };
                    if (field.input_type === 'number') {
                      newFieldValues[field.id] = e.target.value ? parseFloat(e.target.value) : null;
                    } else {
                      newFieldValues[field.id] = e.target.value;
                    }
                    handleChange(newFieldValues);
                  }}
                  placeholder={field.placeholder}
                  required={field.required}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                />
              </div>
            ))}
          </div>
        );

      default:
        return <div>Unsupported question type: {question.ux.type}</div>;
    }
  };

  return (
    <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '8px' }}>
      <div style={{ marginBottom: '10px' }}>
        <h3 style={{ margin: '0 0 5px 0', fontSize: '16px', fontWeight: 'bold' }}>
          {question.title}
          {question.required && <span style={{ color: 'red', marginLeft: '5px' }}>*</span>}
        </h3>
        {question.description && (
          <p style={{ margin: '5px 0', fontSize: '14px', color: '#666' }}>
            {question.description}
          </p>
        )}
        {question.why_this_matters && (
          <p style={{ margin: '5px 0', fontSize: '13px', color: '#888', fontStyle: 'italic' }}>
            Почему это важно: {question.why_this_matters}
          </p>
        )}
      </div>
      {renderInput()}
      {errors.length > 0 && (
        <div style={{ marginTop: '10px', color: 'red', fontSize: '13px' }}>
          {errors.map((error, idx) => (
            <div key={idx}>{error}</div>
          ))}
        </div>
      )}
    </div>
  );
}
