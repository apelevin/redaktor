/**
 * Document Size Policy based on Reasoning Level
 * Defines target size, verbosity, and complexity for each reasoning level
 */

import type { ReasoningLevel, DocumentSizePolicy } from "@/lib/types";

export const SIZE_POLICY: Record<ReasoningLevel, DocumentSizePolicy> = {
  basic: {
    targetPages: { min: 1, max: 2 },
    maxSections: 6,
    maxClauses: 12,
    verbosity: "low",
    includeEdgeCases: false,
    includeOptionalProtections: false,
  },
  standard: {
    targetPages: { min: 3, max: 5 },
    maxSections: 10,
    maxClauses: 22,
    verbosity: "medium",
    includeEdgeCases: false,
    includeOptionalProtections: true,
  },
  professional: {
    targetPages: { min: 6, max: 30 },
    maxSections: 18,
    maxClauses: 45,
    verbosity: "high",
    includeEdgeCases: true,
    includeOptionalProtections: true,
  },
};

/**
 * Get size policy for a reasoning level
 */
export function getSizePolicy(level: ReasoningLevel): DocumentSizePolicy {
  return SIZE_POLICY[level];
}
