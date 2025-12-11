"use client";

import type { LegalDocument } from "@/lib/types";
import DocumentViewer from "./DocumentViewer";

interface DocumentPaneProps {
  document: LegalDocument | null;
  highlightedSectionId?: string;
  highlightedClauseId?: string;
}

export default function DocumentPane({
  document,
  highlightedSectionId,
  highlightedClauseId,
}: DocumentPaneProps) {
  return (
    <div className="document-pane">
      <div className="document-pane-header">
        <h1>Документ</h1>
        {document && (
          <div className="document-status">
            <span className="status-badge">
              {document.mission.documentType}
            </span>
          </div>
        )}
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

