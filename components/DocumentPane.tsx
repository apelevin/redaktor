"use client";

import { useEffect } from "react";
import type { LegalDocument } from "@/lib/types";
import DocumentViewer from "./DocumentViewer";
import { downloadMarkdown } from "@/lib/document-to-markdown";

interface DocumentPaneProps {
  document: LegalDocument | null;
  highlightedSectionId?: string;
  highlightedClauseId?: string;
  totalCost?: number;
  lastModel?: string;
}

export default function DocumentPane({
  document,
  highlightedSectionId,
  highlightedClauseId,
  totalCost,
  lastModel,
}: DocumentPaneProps) {
  useEffect(() => {
    console.log(`[DocumentPane] Props:`, {
      totalCost,
      lastModel,
      totalCostType: typeof totalCost,
      willRender: totalCost !== undefined,
    });
  }, [totalCost, lastModel]);

  return (
    <div className="document-pane">
      <div className="document-pane-header">
        <h1>Документ</h1>
        <div className="document-header-right">
          {totalCost !== undefined && totalCost !== null && (
            <span className="cost-amount">${totalCost.toFixed(4)}</span>
          )}
          {document && (
            <>
              <div className="document-status">
                <span className="status-badge">
                  {document.mission.documentType}
                </span>
              </div>
              <button
                onClick={() => downloadMarkdown(document)}
                className="btn btn-secondary"
                style={{ fontSize: "0.875rem", padding: "0.5rem 0.75rem" }}
                title="Скачать документ в формате Markdown"
              >
                Скачать Markdown
              </button>
            </>
          )}
        </div>
      </div>
      <div className="document-pane-content">
        <DocumentViewer
          document={document}
          highlightedSectionId={highlightedSectionId}
          highlightedClauseId={highlightedClauseId}
        />
      </div>
    </div>
  );
}

