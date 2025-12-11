"use client";

import type { UserQuestion, UserAnswer, QuestionOption } from "@/lib/types";
import { useState } from "react";

interface QuestionFormProps {
  question: UserQuestion;
  onSubmit: (answer: UserAnswer) => void;
  onCancel?: () => void;
}

export default function QuestionForm({
  question,
  onSubmit,
  onCancel,
}: QuestionFormProps) {
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const answer: UserAnswer = {
      questionId: question.id,
    };

    if (question.type === "free_text") {
      answer.freeText = freeText;
    } else if (question.type === "single_choice") {
      if (selectedOptions.length > 0) {
        answer.selectedOptionIds = [selectedOptions[0]];
      }
    } else if (question.type === "multi_choice") {
      answer.selectedOptionIds = selectedOptions;
    }

    onSubmit(answer);
  };

  const toggleOption = (optionId: string) => {
    if (question.type === "single_choice") {
      setSelectedOptions([optionId]);
    } else {
      setSelectedOptions((prev) =>
        prev.includes(optionId)
          ? prev.filter((id) => id !== optionId)
          : [...prev, optionId]
      );
    }
  };

  return (
    <div className="question-form">
      <div className="question-header">
        <h3 className="question-title">{question.title}</h3>
        <p className="question-text">{question.text}</p>
        {question.legalImpact && (
          <div className="legal-impact">
            <strong>Юридические последствия:</strong> {question.legalImpact}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="question-form-content">
        {question.type === "free_text" ? (
          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="Введите ваш ответ..."
            className="question-textarea"
            required
          />
        ) : (
          <div className="question-options">
            {question.options?.map((option) => (
              <label
                key={option.id}
                className={`question-option ${
                  selectedOptions.includes(option.id) ? "selected" : ""
                } ${option.isRecommended ? "recommended" : ""} ${
                  option.riskLevel ? `risk-${option.riskLevel}` : ""
                }`}
              >
                <input
                  type={question.type === "single_choice" ? "radio" : "checkbox"}
                  name={question.id}
                  value={option.id}
                  checked={selectedOptions.includes(option.id)}
                  onChange={() => toggleOption(option.id)}
                />
                <div className="option-content">
                  <div className="option-label">{option.label}</div>
                  {option.description && (
                    <div className="option-description">{option.description}</div>
                  )}
                  {option.isRecommended && (
                    <span className="option-badge recommended">Рекомендуется</span>
                  )}
                  {option.riskLevel && (
                    <span className={`option-badge risk-${option.riskLevel}`}>
                      Риск: {option.riskLevel}
                    </span>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}

        <div className="question-actions">
          <button type="submit" className="btn btn-primary" disabled={
            question.type !== "free_text" && selectedOptions.length === 0
          }>
            Отправить ответ
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="btn btn-secondary"
            >
              Отмена
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

