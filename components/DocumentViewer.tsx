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
          {document.profile.primaryPurpose} - {document.mission.jurisdiction.join(", ")}
        </h1>
        <div className="document-meta">
          <span>Язык: {document.mission.language}</span>
          {document.mission.parties.length > 0 && (
            <span>Стороны: {document.mission.parties.map(p => p.displayName).join(", ")}</span>
          )}
        </div>
      </div>

      <div className="document-content">
        {/* PRO: Используем обязательные поля согласно archv2.md */}
        {(() => {
          // PRO: Обязательные поля согласно archv2.md
          const sections = document.skeleton.sections;
          const clauses = document.clauseDrafts;

          if (sections.length > 0) {
            return sections
              .sort((a, b) => a.order - b.order)
              .map((section) => {
                const isHighlighted = section.id === highlightedSectionId;
                // PRO: Match clauses by requirementId or sectionId
                const sectionClauses = clauses.filter((c) => 
                  (c.requirementId && section.clauseRequirementIds?.includes(c.requirementId)) ||
                  (c.sectionId === section.id)
                ).sort((a, b) => a.order - b.order);

                return (
                  <div
                    key={section.id}
                    ref={(el) => {
                      if (el) sectionRefs.current.set(section.id, el);
                    }}
                    className={`document-section ${isHighlighted ? "highlighted" : ""}`}
                  >
                    <h2 className="section-title">{section.title}</h2>
                    {sectionClauses.map((clause) => {
                      const isClauseHighlighted =
                        clause.id === highlightedClauseId;
                      return (
                        <div
                          key={clause.id}
                          ref={(el) => {
                            if (el) sectionRefs.current.set(clause.id, el);
                          }}
                          className={`document-clause ${isClauseHighlighted ? "highlighted" : ""} ${clause.lockedByUser ? "user-locked" : ""}`}
                        >
                          <div className="clause-text">{clause.text}</div>
                          {clause.reasoningSummary && (
                            <div className="clause-reasoning">
                              <small>{clause.reasoningSummary}</small>
                            </div>
                          )}
                          {/* PRO: Show source and lock status */}
                          {(clause.source || clause.lockedByUser) && (
                            <div className="clause-meta" style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#6b7280" }}>
                              {clause.lockedByUser && <span style={{ color: "#059669" }}>🔒 Заблокировано пользователем</span>}
                              {clause.source === "user" && <span>✏️ Редактировано пользователем</span>}
                              {clause.source === "merged" && <span>🔄 Объединено</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              });
          }
          return null;
        })()}
        {/* PRO: Show parties information if available */}
        {document.mission.parties && document.mission.parties.length > 0 && (
          <div className="document-section" style={{ marginTop: "2rem", padding: "1rem", backgroundColor: "#f9fafb", borderRadius: "0.5rem" }}>
            <h2 className="section-title">Стороны договора</h2>
            {document.mission.parties.map((party) => (
              <div key={party.id} style={{ marginBottom: "1rem" }}>
                <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>{party.displayName}</div>
                {party.legalName && <div>Полное наименование: {party.legalName}</div>}
                {party.identifiers?.inn && <div>ИНН: {party.identifiers.inn}</div>}
                {party.identifiers?.ogrn && <div>ОГРН: {party.identifiers.ogrn}</div>}
                {party.address && <div>Адрес: {party.address}</div>}
                {party.representative && (
                  <div style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#6b7280" }}>
                    Подписант: {party.representative.name}, {party.representative.position}, {party.representative.basis}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {document.skeleton.sections.length === 0 && (
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

