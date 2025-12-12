/**
 * Prohibited Patterns for Russian Federation
 * Patterns that are illegal, unenforceable, or highly risky under RU law
 */

export const PROHIBITED_PATTERNS_RU: string[] = [
  // Employment
  "non-compete_employee_penalty", // Штрафы работнику за нарушение неконкуренции (часто недействительны)
  "employee_liability_beyond_fault", // Ответственность работника сверх вины
  "waiver_of_labor_rights", // Отказ от трудовых прав
  
  // Consumer protection
  "consumer_waiver_of_guarantees", // Отказ от гарантий для потребителя
  "unfair_consumer_terms", // Несправедливые условия для потребителя
  
  // Data protection
  "consent_for_illegal_processing", // Согласие на незаконную обработку ПД
  "transfer_pd_without_basis", // Передача ПД без правового основания
  
  // General
  "penalty_exceeding_damages", // Штраф превышающий ущерб (может быть снижен судом)
  "unilateral_termination_without_notice", // Одностороннее расторжение без уведомления (для некоторых договоров)
  "jurisdiction_outside_russia_for_ru_entities", // Подсудность вне РФ для российских юрлиц (ограничения)
];

/**
 * Check if a pattern is prohibited
 */
export function isProhibitedPattern(pattern: string): boolean {
  return PROHIBITED_PATTERNS_RU.includes(pattern);
}

/**
 * Get prohibited patterns for specific legal domain
 */
export function getProhibitedPatternsForDomain(domain: string): string[] {
  return PROHIBITED_PATTERNS_RU.filter((pattern) => 
    pattern.startsWith(domain.toLowerCase().replace(/\s+/g, "_"))
  );
}
