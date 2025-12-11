/**
 * Legal Document Checklists
 * Base checklists for different document types
 */

import type { Issue } from "@/lib/types";

export interface DocumentChecklist {
  documentType: string;
  requiredIssues: Issue[];
  optionalIssues: Issue[];
}

const baseIssues: Record<string, Omit<Issue, "id">> = {
  confidentiality: {
    category: "Confidentiality",
    description: "Определение конфиденциальной информации и обязательств по её защите",
    severity: "high",
    required: true,
  },
  term: {
    category: "Term",
    description: "Срок действия документа",
    severity: "medium",
    required: true,
  },
  termination: {
    category: "Termination",
    description: "Условия расторжения договора",
    severity: "high",
    required: true,
  },
  liability: {
    category: "Liability",
    description: "Ограничение ответственности сторон",
    severity: "high",
    required: true,
  },
  ip: {
    category: "IP",
    description: "Права на интеллектуальную собственность",
    severity: "high",
    required: false,
  },
  sla: {
    category: "SLA",
    description: "Уровни обслуживания и гарантии",
    severity: "medium",
    required: false,
  },
  data_protection: {
    category: "Data Protection",
    description: "Защита персональных данных",
    severity: "high",
    required: false,
  },
  dispute_resolution: {
    category: "Dispute Resolution",
    description: "Разрешение споров и юрисдикция",
    severity: "medium",
    required: true,
  },
  non_solicit: {
    category: "Non-Solicit",
    description: "Запрет переманивания сотрудников",
    severity: "low",
    required: false,
  },
  non_compete: {
    category: "Non-Compete",
    description: "Запрет конкуренции",
    severity: "medium",
    required: false,
  },
  audit_rights: {
    category: "Audit Rights",
    description: "Права на аудит и проверку",
    severity: "low",
    required: false,
  },
  salary: {
    category: "Salary",
    description: "Условия оплаты труда",
    severity: "high",
    required: true,
  },
  working_hours: {
    category: "Working Hours",
    description: "Режим работы и отдыха",
    severity: "high",
    required: true,
  },
  vacation: {
    category: "Vacation",
    description: "Отпуска и выходные дни",
    severity: "medium",
    required: true,
  },
  job_duties: {
    category: "Job Duties",
    description: "Трудовые обязанности работника",
    severity: "high",
    required: true,
  },
  probation: {
    category: "Probation",
    description: "Испытательный срок",
    severity: "medium",
    required: false,
  },
  non_compete_employment: {
    category: "Non-Compete",
    description: "Ограничения на работу у конкурентов после увольнения",
    severity: "medium",
    required: false,
  },
};

function createIssue(key: string, id: string): Issue {
  return {
    id,
    ...baseIssues[key],
  };
}

export const NDA_CHECKLIST: DocumentChecklist = {
  documentType: "NDA",
  requiredIssues: [
    createIssue("confidentiality", "nda-confidentiality"),
    createIssue("term", "nda-term"),
    createIssue("termination", "nda-termination"),
  ],
  optionalIssues: [
    createIssue("non_solicit", "nda-non-solicit"),
    createIssue("non_compete", "nda-non-compete"),
    createIssue("audit_rights", "nda-audit-rights"),
    createIssue("data_protection", "nda-data-protection"),
  ],
};

export const SAAS_MSA_CHECKLIST: DocumentChecklist = {
  documentType: "SaaS_MSA",
  requiredIssues: [
    createIssue("term", "saas-term"),
    createIssue("termination", "saas-termination"),
    createIssue("liability", "saas-liability"),
    createIssue("ip", "saas-ip"),
    createIssue("dispute_resolution", "saas-dispute"),
  ],
  optionalIssues: [
    createIssue("sla", "saas-sla"),
    createIssue("data_protection", "saas-data-protection"),
    createIssue("audit_rights", "saas-audit-rights"),
  ],
};

export const SERVICE_AGREEMENT_CHECKLIST: DocumentChecklist = {
  documentType: "SERVICE_AGREEMENT",
  requiredIssues: [
    createIssue("term", "service-term"),
    createIssue("termination", "service-termination"),
    createIssue("liability", "service-liability"),
    createIssue("dispute_resolution", "service-dispute"),
  ],
  optionalIssues: [
    createIssue("sla", "service-sla"),
    createIssue("ip", "service-ip"),
    createIssue("data_protection", "service-data-protection"),
  ],
};

export const EMPLOYMENT_CONTRACT_CHECKLIST: DocumentChecklist = {
  documentType: "EMPLOYMENT_CONTRACT",
  requiredIssues: [
    createIssue("job_duties", "employment-job-duties"),
    createIssue("salary", "employment-salary"),
    createIssue("working_hours", "employment-working-hours"),
    createIssue("vacation", "employment-vacation"),
    createIssue("term", "employment-term"),
    createIssue("termination", "employment-termination"),
    createIssue("dispute_resolution", "employment-dispute"),
  ],
  optionalIssues: [
    createIssue("probation", "employment-probation"),
    createIssue("non_compete_employment", "employment-non-compete"),
    createIssue("confidentiality", "employment-confidentiality"),
    createIssue("liability", "employment-liability"),
  ],
};

export function getChecklist(documentType: string): DocumentChecklist | null {
  switch (documentType) {
    case "NDA":
      return NDA_CHECKLIST;
    case "SaaS_MSA":
      return SAAS_MSA_CHECKLIST;
    case "SERVICE_AGREEMENT":
      return SERVICE_AGREEMENT_CHECKLIST;
    case "EMPLOYMENT_CONTRACT":
      return EMPLOYMENT_CONTRACT_CHECKLIST;
    default:
      return null;
  }
}

