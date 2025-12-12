"use client";

import type { LegalDocument } from "@/lib/types";
import { useEffect, useRef } from "react";

interface DocumentViewerProps {
  document: LegalDocument | null;
  highlightedSectionId?: string;
  highlightedClauseId?: string;
}

export default function DocumentViewer({
  document,
  highlightedSectionId,
  highlightedClauseId,
}: DocumentViewerProps) {
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (highlightedSectionId || highlightedClauseId) {
      const element = highlightedSectionId
        ? sectionRefs.current.get(highlightedSectionId)
        : highlightedClauseId
        ? sectionRefs.current.get(highlightedClauseId)
        : null;

      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [highlightedSectionId, highlightedClauseId]);

  if (!document) {
    return (
      <div className="document-viewer empty">
        <p className="empty-message">
          Документ будет отображен здесь после начала работы с агентом
        </p>
      </div>
    );
  }

  // Show document even if sections/clauses are empty (document structure exists)
  // Document should be displayed as soon as it's created, even if not fully populated

  return (
    <div className="document-viewer">
      <div className="document-header">
        <h1 className="document-title">
          {document.mission.documentType} - {document.mission.jurisdiction}
        </h1>
        <div className="document-meta">
          <span>Язык: {document.mission.language}</span>
          {document.mission.partyA && (
            <span>Сторона A: {document.mission.partyA}</span>
          )}
          {document.mission.partyB && (
            <span>Сторона B: {document.mission.partyB}</span>
          )}
        </div>
      </div>

      <div className="document-content">
        {document.sections && document.sections.length > 0 ? (
          document.sections
            .sort((a, b) => a.order - b.order)
            .map((section) => {
            const isHighlighted = section.id === highlightedSectionId;
            const clauses = document.clauses
              .filter((c) => c.sectionId === section.id)
              .sort((a, b) => a.order - b.order);

            return (
              <div
                key={section.id}
                ref={(el) => {
                  if (el) sectionRefs.current.set(section.id, el);
                }}
                className={`document-section ${isHighlighted ? "highlighted" : ""}`}
              >
                <h2 className="section-title">{section.title}</h2>
                {clauses.map((clause) => {
                  const isClauseHighlighted =
                    clause.id === highlightedClauseId;
                  return (
                    <div
                      key={clause.id}
                      ref={(el) => {
                        if (el) sectionRefs.current.set(clause.id, el);
                      }}
                      className={`document-clause ${isClauseHighlighted ? "highlighted" : ""}`}
                    >
                      <div className="clause-text">{clause.text}</div>
                      {clause.reasoningSummary && (
                        <div className="clause-reasoning">
                          <small>{clause.reasoningSummary}</small>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        ) : (
          <div className="document-section">
            <p className="empty-message">
              Документ создан. Разделы будут добавлены по мере работы агента.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

