/**
 * Convert LegalDocument to Markdown format
 */

import type { LegalDocument } from "./types";

export function documentToMarkdown(document: LegalDocument): string {
  const lines: string[] = [];

  // Document header
  lines.push(`# ${document.mission.documentType}`);
  lines.push("");

  // Metadata
  lines.push("## Метаданные");
  lines.push("");
  lines.push(`- **Юрисдикция**: ${document.mission.jurisdiction}`);
  lines.push(`- **Язык**: ${document.mission.language}`);
  if (document.mission.partyA) {
    lines.push(`- **Сторона A**: ${document.mission.partyA}`);
  }
  if (document.mission.partyB) {
    lines.push(`- **Сторона B**: ${document.mission.partyB}`);
  }
  if (document.mission.businessContext) {
    lines.push(`- **Бизнес-контекст**: ${document.mission.businessContext}`);
  }
  if (document.mission.userGoals && document.mission.userGoals.length > 0) {
    lines.push(`- **Цели**: ${document.mission.userGoals.join(", ")}`);
  }
  if (document.mission.riskTolerance) {
    lines.push(`- **Толерантность к риску**: ${document.mission.riskTolerance}`);
  }
  if (document.createdAt) {
    lines.push(`- **Создан**: ${new Date(document.createdAt).toLocaleDateString("ru-RU")}`);
  }
  if (document.updatedAt) {
    lines.push(`- **Обновлен**: ${new Date(document.updatedAt).toLocaleDateString("ru-RU")}`);
  }
  lines.push("");

  // Document content
  if (document.sections && document.sections.length > 0) {
    const sortedSections = [...document.sections].sort((a, b) => a.order - b.order);

    for (const section of sortedSections) {
      // Section title
      lines.push(`## ${section.title}`);
      lines.push("");

      // Get clauses for this section
      const clauses = document.clauses
        .filter((c) => c.sectionId === section.id)
        .sort((a, b) => a.order - b.order);

      if (clauses.length > 0) {
        for (const clause of clauses) {
          // Clause text (preserve line breaks)
          const clauseText = clause.text
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .join("\n\n");

          lines.push(clauseText);
          lines.push("");

          // Reasoning summary (if exists)
          if (clause.reasoningSummary) {
            lines.push(`*Примечание: ${clause.reasoningSummary}*`);
            lines.push("");
          }
        }
      } else {
        lines.push("*Раздел пуст*");
        lines.push("");
      }
    }
  } else {
    lines.push("*Документ не содержит разделов*");
    lines.push("");
  }

  return lines.join("\n");
}

export function downloadMarkdown(document: LegalDocument, filename?: string): void {
  const markdown = documentToMarkdown(document);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || `${document.mission.documentType.replace(/\s+/g, "_")}.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
