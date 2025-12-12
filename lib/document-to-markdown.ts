/**
 * Convert LegalDocument to Markdown format
 */

import type { LegalDocument } from "./types";

export function documentToMarkdown(document: LegalDocument): string {
  const lines: string[] = [];

  // Document header
  lines.push(`# ${document.profile.primaryPurpose}`);
  lines.push("");

  // Metadata
  lines.push("## Метаданные");
  lines.push("");
  lines.push(`- **Юрисдикция**: ${document.mission.jurisdiction.join(", ")}`);
  lines.push(`- **Язык**: ${document.mission.language}`);
  if (document.mission.parties.length > 0) {
    document.mission.parties.forEach((party, idx) => {
      lines.push(`- **Сторона ${idx + 1} (${party.displayName})**: ${party.legalName || "не указано"}`);
    });
  }
  if (document.mission.businessContext) {
    lines.push(`- **Бизнес-контекст**: ${document.mission.businessContext}`);
  }
  if (document.mission.userGoals && document.mission.userGoals.length > 0) {
    lines.push(`- **Цели**: ${document.mission.userGoals.join(", ")}`);
  }
  if (document.profile.riskPosture) {
    lines.push(`- **Риск-позиция**: ${document.profile.riskPosture}`);
  }
  if (document.createdAt) {
    lines.push(`- **Создан**: ${new Date(document.createdAt).toLocaleDateString("ru-RU")}`);
  }
  if (document.updatedAt) {
    lines.push(`- **Обновлен**: ${new Date(document.updatedAt).toLocaleDateString("ru-RU")}`);
  }
  lines.push("");

  // Document content - используем обязательные поля согласно archv2.md
  if (document.skeleton.sections.length > 0) {
    const sortedSections = [...document.skeleton.sections].sort((a, b) => a.order - b.order);

    for (const section of sortedSections) {
      // Section title
      lines.push(`## ${section.title}`);
      lines.push("");

      // Get clauses for this section - используем clauseRequirementIds
      const clauses = document.clauseDrafts
        .filter((c) => 
          c.requirementId && section.clauseRequirementIds.includes(c.requirementId)
        )
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

export function downloadMarkdown(legalDocument: LegalDocument, filename?: string): void {
  const markdown = documentToMarkdown(legalDocument);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = globalThis.document.createElement("a");
  link.href = url;
  link.download = filename || `${legalDocument.profile.primaryPurpose.replace(/\s+/g, "_")}.md`;
  globalThis.document.body.appendChild(link);
  link.click();
  globalThis.document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
