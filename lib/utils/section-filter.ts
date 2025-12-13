/**
 * Утилита для фильтрации разделов про стороны и реквизиты
 */

/**
 * Проверяет, является ли раздел разделом про стороны или реквизиты
 * @param sectionTitle - название раздела
 * @param sectionId - ID раздела (опционально)
 * @returns true, если раздел нужно исключить из обработки
 */
export function isPartiesOrRequisitesSection(
  sectionTitle: string,
  sectionId?: string
): boolean {
  const title = sectionTitle.toLowerCase().trim();
  const id = sectionId?.toLowerCase().trim() || '';

  // Ключевые слова для разделов про стороны
  const partiesKeywords = [
    'сторон',
    'сторона',
    'подпис',
    'реквизит',
  ];

  // Проверяем по названию
  for (const keyword of partiesKeywords) {
    if (title.includes(keyword)) {
      return true;
    }
  }

  // Проверяем по ID
  for (const keyword of partiesKeywords) {
    if (id.includes(keyword)) {
      return true;
    }
  }

  return false;
}

/**
 * Фильтрует список разделов, исключая разделы про стороны и реквизиты
 */
export function filterOutPartiesAndRequisites<T extends { title: string; id?: string }>(
  sections: T[]
): T[] {
  return sections.filter(
    (section) => !isPartiesOrRequisitesSection(section.title, section.id)
  );
}

