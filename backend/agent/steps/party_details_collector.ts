/**
 * Step 3: Party Details Collector (PRO)
 * Collects party information and requisites through HITL forms
 */

import type {
  AgentState,
  LegalDocument,
  AgentStepResult,
  ContractParty,
  PartyRole,
  UserQuestion,
  ChatMessage,
  LegalDocumentMission,
} from "@/lib/types";
import { updateAgentStateData } from "../state";

export async function partyDetailsCollector(
  agentState: AgentState,
  document: LegalDocument | null
): Promise<AgentStepResult> {
  const mission = agentState.mission as LegalDocumentMission | undefined;
  const existingParties = agentState.parties; // обязательное поле на верхнем уровне

  if (!mission) {
    throw new Error("Mission not found in agent state");
  }

  // Determine required party roles based on profile and context
  const profile = agentState.profile as any;
  const requiredRoles: PartyRole[] = [];

  // Determine roles from context
  if (profile?.legalDomains?.includes("services")) {
    requiredRoles.push("customer", "vendor");
  } else if (profile?.legalDomains?.includes("employment_ru")) {
    requiredRoles.push("employer", "employee");
  } else if (profile?.legalDomains?.includes("lease_ru")) {
    requiredRoles.push("landlord", "tenant");
  } else {
    // Default: customer/vendor
    requiredRoles.push("customer", "vendor");
  }

  // Check which parties are already collected
  const collectedRoles = existingParties?.map((p) => p.role) || [];
  const missingRoles = requiredRoles.filter((role) => !collectedRoles.includes(role));

  if (missingRoles.length === 0 && existingParties && existingParties.length > 0) {
    // All parties collected, continue
    const chatMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: `Информация о сторонах собрана. Перехожу к определению юридических вопросов...`,
      timestamp: new Date(),
    };

    return {
      type: "continue",
      state: agentState,
      chatMessages: [chatMessage],
    };
  }

  // Need to collect party details
  const roleToCollect = missingRoles[0];
  const roleDisplayNames: Record<PartyRole, string> = {
    customer: "Заказчик",
    vendor: "Исполнитель",
    employer: "Работодатель",
    employee: "Работник",
    landlord: "Арендодатель",
    tenant: "Арендатор",
    contractor: "Подрядчик",
    other: "Сторона",
  };

  const question: UserQuestion = {
    id: `question-party-${roleToCollect}-${Date.now()}`,
    type: "form",
    title: `Реквизиты ${roleDisplayNames[roleToCollect]}`,
    text: `Для составления документа необходимо указать реквизиты ${roleDisplayNames[roleToCollect]}. Пожалуйста, заполните форму ниже.`,
    required: true,
    legalImpact: "Реквизиты сторон необходимы для юридической силы документа и идентификации сторон.",
    // Form fields are handled by QuestionForm component
    // The formData will include 'role' field set to roleToCollect
  };

  const chatMessage: ChatMessage = {
    id: `msg-${Date.now()}`,
    role: "assistant",
    content: `Мне нужны реквизиты ${roleDisplayNames[roleToCollect]} для составления документа.`,
    timestamp: new Date(),
  };

  return {
    type: "need_user_input",
    state: agentState,
    question,
    chatMessages: [chatMessage],
  };
}

/**
 * Process party form data and create ContractParty
 */
export function processPartyFormData(
  role: PartyRole,
  formData: Record<string, any>
): ContractParty {
  const roleDisplayNames: Record<PartyRole, string> = {
    customer: "Заказчик",
    vendor: "Исполнитель",
    employer: "Работодатель",
    employee: "Работник",
    landlord: "Арендодатель",
    tenant: "Арендатор",
    contractor: "Подрядчик",
    other: "Сторона",
  };

  const party: ContractParty = {
    id: `party-${role}-${Date.now()}`,
    role,
    displayName: roleDisplayNames[role],
    legalName: formData.legalName,
    legalForm: formData.legalForm,
    address: formData.address,
  };

  // Add identifiers if provided
  if (formData.inn || formData.ogrn || formData.kpp) {
    party.identifiers = {
      inn: formData.inn,
      ogrn: formData.ogrn,
      kpp: formData.kpp,
    };
  }

  // Add representative if provided
  if (formData.representativeName) {
    party.representative = {
      name: formData.representativeName,
      position: formData.representativePosition || "",
      basis: formData.representativeBasis || "на основании Устава",
    };
  }

  // Add bank details if provided
  if (formData.bankAccount || formData.bankName || formData.bik) {
    party.bankDetails = {
      account: formData.bankAccount,
      bankName: formData.bankName,
      bik: formData.bik,
      corrAccount: formData.corrAccount,
    };
  }

  return party;
}
