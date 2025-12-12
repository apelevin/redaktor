/**
 * Profile Rules for Russian Federation
 * Rules engine for building DocumentProfile based on mission context
 */

import type {
  LegalDocumentMission,
  DocumentProfile,
  LegalDomain,
  LegalBlock,
} from "@/lib/types";

/**
 * Apply profile rules based on mission context
 */
export function applyProfileRules(
  mission: LegalDocumentMission,
  profileDraft: Partial<DocumentProfile>
): DocumentProfile {
  let profile: DocumentProfile = {
    primaryPurpose: profileDraft.primaryPurpose || "юридический документ",
    legalDomains: profileDraft.legalDomains || [],
    mandatoryBlocks: profileDraft.mandatoryBlocks || [],
    optionalBlocks: profileDraft.optionalBlocks || [],
    prohibitedPatterns: profileDraft.prohibitedPatterns || [],
    marketArchetype: profileDraft.marketArchetype,
    riskPosture: profileDraft.riskPosture || "balanced",
  };

  const context = mission.businessContext?.toLowerCase() || "";
  const goals = mission.userGoals?.join(" ").toLowerCase() || "";
  const jurisdiction = mission.jurisdiction?.[0] || "RU";

  // Rule 1: Employment domain
  if (
    context.includes("трудов") ||
    context.includes("работ") ||
    context.includes("employment") ||
    goals.includes("трудов") ||
    goals.includes("работ")
  ) {
    profile.legalDomains.push("employment_ru");
    profile.mandatoryBlocks.push("preamble_parties");
    profile.mandatoryBlocks.push("term_renewal");
    profile.prohibitedPatterns.push("non-compete_employee_penalty");
    profile.prohibitedPatterns.push("employee_liability_beyond_fault");
    profile.prohibitedPatterns.push("waiver_of_labor_rights");
  }

  // Rule 2: Services domain
  if (
    context.includes("услуг") ||
    context.includes("разработк") ||
    context.includes("services") ||
    goals.includes("услуг")
  ) {
    profile.legalDomains.push("services");
    profile.mandatoryBlocks.push("subject_scope");
    profile.mandatoryBlocks.push("deliverables_acceptance");
    profile.mandatoryBlocks.push("fees_payment");
    
    // If services + IP mentioned
    if (context.includes("права") || context.includes("ip") || goals.includes("права")) {
      profile.legalDomains.push("ip");
      profile.mandatoryBlocks.push("ip_rights");
      // Will require decision about IP model (assignment vs license)
    }
  }

  // Rule 3: Data protection (152-ФЗ)
  if (
    context.includes("персональн") ||
    context.includes("данн") ||
    context.includes("personal data") ||
    goals.includes("персональн")
  ) {
    profile.legalDomains.push("data_protection_ru");
    profile.mandatoryBlocks.push("data_protection_ru");
    profile.prohibitedPatterns.push("consent_for_illegal_processing");
    profile.prohibitedPatterns.push("transfer_pd_without_basis");
  }

  // Rule 4: Confidentiality
  if (
    context.includes("конфиденциальн") ||
    context.includes("nda") ||
    context.includes("секрет") ||
    goals.includes("конфиденциальн")
  ) {
    profile.legalDomains.push("confidentiality");
    profile.mandatoryBlocks.push("confidentiality");
  }

  // Rule 5: SLA / Service levels
  if (
    context.includes("sla") ||
    context.includes("уровень обслуживан") ||
    context.includes("гаранти") ||
    goals.includes("sla")
  ) {
    profile.legalDomains.push("sla");
    profile.mandatoryBlocks.push("service_levels_sla");
  }

  // Rule 6: Payment terms
  if (
    context.includes("оплат") ||
    context.includes("платеж") ||
    context.includes("payment") ||
    goals.includes("оплат")
  ) {
    profile.legalDomains.push("payment");
    profile.mandatoryBlocks.push("fees_payment");
  }

  // Rule 7: Liability
  profile.legalDomains.push("liability");
  profile.mandatoryBlocks.push("liability_cap_exclusions");

  // Rule 8: Termination
  profile.legalDomains.push("termination");
  profile.mandatoryBlocks.push("termination");

  // Rule 9: Dispute resolution (always for RU)
  if (jurisdiction === "RU") {
    profile.legalDomains.push("dispute_resolution");
    profile.mandatoryBlocks.push("dispute_resolution");
    profile.legalDomains.push("governing_law");
    profile.mandatoryBlocks.push("governing_law");
  }

  // Rule 10: Force majeure (standard for contracts)
  profile.legalDomains.push("force_majeure");
  profile.mandatoryBlocks.push("force_majeure");

  // Rule 11: Security (if data or services)
  if (
    profile.legalDomains.includes("data_protection_ru") ||
    profile.legalDomains.includes("services")
  ) {
    profile.legalDomains.push("security");
    profile.mandatoryBlocks.push("info_security");
  }

  // Rule 12: Definitions (always include)
  profile.mandatoryBlocks.push("definitions");

  // Rule 13: Preamble with parties (always include)
  profile.mandatoryBlocks.push("preamble_parties");

  // Remove duplicates
  profile.legalDomains = [...new Set(profile.legalDomains)];
  profile.mandatoryBlocks = [...new Set(profile.mandatoryBlocks)];
  profile.prohibitedPatterns = [...new Set(profile.prohibitedPatterns)];

  // Determine market archetype
  if (!profile.marketArchetype) {
    if (profile.legalDomains.includes("services") && profile.legalDomains.includes("ip")) {
      profile.marketArchetype = "Services + IP assignment (RU)";
    } else if (profile.legalDomains.includes("confidentiality")) {
      profile.marketArchetype = "NDA (RU)";
    } else if (profile.legalDomains.includes("services")) {
      profile.marketArchetype = "Services Agreement (RU)";
    } else {
      profile.marketArchetype = "General Contract (RU)";
    }
  }

  return profile;
}

/**
 * Determine if profile requires user decision
 */
export function requiresUserDecision(profile: DocumentProfile): {
  requiresDecision: boolean;
  decisionKey?: string;
  reason?: string;
} {
  // If services + IP, need to decide IP model
  if (
    profile.legalDomains.includes("services") &&
    profile.legalDomains.includes("ip")
  ) {
    return {
      requiresDecision: true,
      decisionKey: "ip_model",
      reason: "Необходимо определить модель прав на интеллектуальную собственность: отчуждение или лицензия",
    };
  }

  // If data protection, need to decide PD regime
  if (profile.legalDomains.includes("data_protection_ru")) {
    return {
      requiresDecision: true,
      decisionKey: "pd_regime_ru",
      reason: "Необходимо определить режим обработки персональных данных: оператор/обработчик/поручение",
    };
  }

  return { requiresDecision: false };
}
