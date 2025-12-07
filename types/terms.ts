/**
 * Термин из словаря терминов договора
 */
export interface Term {
  /** Краткое имя термина с заглавной буквы (например, "Автомобиль", "Квартира", "Услуги") */
  name: string;
  /** Полное описание/идентификация термина */
  definition: string;
  /** Роль термина в договоре (опционально) */
  role?: 'main_object' | 'party' | 'contract' | 'service' | 'document' | 'other';
}

/**
 * Словарь терминов договора
 */
export type TermsDictionary = Term[];

