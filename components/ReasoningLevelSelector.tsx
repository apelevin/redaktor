"use client";

import React from "react";
import type { ReasoningLevel } from "@/lib/types";

interface ReasoningLevelSelectorProps {
  selectedLevel: ReasoningLevel | null;
  onSelect: (level: ReasoningLevel) => void;
}

export default function ReasoningLevelSelector({
  selectedLevel,
  onSelect,
}: ReasoningLevelSelectorProps) {
  const levels: Array<{
    id: ReasoningLevel;
    label: string;
    legalEffect: string;
    isRecommended: boolean;
    riskLevel: "low" | "medium" | "high";
  }> = [
    {
      id: "basic",
      label: "Базовый",
      legalEffect: "Короткий документ (1–2 страницы), только обязательные условия",
      isRecommended: false,
      riskLevel: "medium",
    },
    {
      id: "standard",
      label: "Стандартный",
      legalEffect: "Рыночный уровень (3–5 страниц), сбалансированные защиты",
      isRecommended: true,
      riskLevel: "low",
    },
    {
      id: "professional",
      label: "Профессиональный",
      legalEffect: "Максимально подробный документ, BigLaw-уровень, edge-cases",
      isRecommended: false,
      riskLevel: "low",
    },
  ];

  return (
    <div className="reasoning-level-selector">
      <div className="reasoning-level-header">
        <h3>Уровень проработки документа</h3>
        <p className="reasoning-level-description">
          Выберите, насколько подробно и глубоко нужно проработать юридический документ.
        </p>
        <p className="reasoning-level-impact">
          Уровень влияет на объём, детализацию и количество защитных положений в договоре.
        </p>
      </div>

      <div className="reasoning-level-options">
        {levels.map((level) => (
          <button
            key={level.id}
            className={`reasoning-level-option ${
              selectedLevel === level.id ? "selected" : ""
            } ${level.isRecommended ? "recommended" : ""}`}
            onClick={() => onSelect(level.id)}
            type="button"
          >
            <div className="reasoning-level-option-header">
              <span className="reasoning-level-label">{level.label}</span>
              {level.isRecommended && (
                <span className="reasoning-level-badge">Рекомендуется</span>
              )}
            </div>
            <p className="reasoning-level-effect">{level.legalEffect}</p>
            <div className="reasoning-level-risk">
              Риск:{" "}
              <span className={`risk-${level.riskLevel}`}>
                {level.riskLevel === "low"
                  ? "Низкий"
                  : level.riskLevel === "medium"
                  ? "Средний"
                  : "Высокий"}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
