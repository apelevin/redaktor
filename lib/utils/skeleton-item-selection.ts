import type { Section } from '@/types/document';
import type { DocumentMode, ItemImportance } from '@/types/document-mode';
import type { SkeletonItem } from '@/types/document';

/**
 * Получает importance пункта, учитывая обратную совместимость
 */
function getItemImportance(item: SkeletonItem | string): ItemImportance {
  if (typeof item === 'string') {
    return 'normal'; // Для обратной совместимости
  }
  return item.importance || 'normal';
}

/**
 * Получает текст пункта, учитывая обратную совместимость
 */
function getItemText(item: SkeletonItem | string): string {
  if (typeof item === 'string') {
    return item;
  }
  return item.text;
}

/**
 * Определяет, должен ли пункт быть выбран по умолчанию в зависимости от режима
 */
function shouldSelectItem(item: SkeletonItem | string, mode: DocumentMode): boolean {
  const importance = getItemImportance(item);
  
  switch (mode) {
    case 'short':
      // Только core пункты
      return importance === 'core';
    case 'standard':
      // core + normal
      return importance === 'core' || importance === 'normal';
    case 'extended':
    case 'expert':
      // Все пункты
      return true;
    default:
      return false;
  }
}

/**
 * Получает набор ключей пунктов, которые должны быть выбраны по умолчанию
 * в зависимости от режима генерации документа
 */
export function getDefaultSelectedItems(
  skeleton: Section[],
  mode: DocumentMode
): Set<string> {
  const selectedItems = new Set<string>();
  
  skeleton.forEach((section) => {
    section.items.forEach((item, index) => {
      if (shouldSelectItem(item, mode)) {
        const key = `${section.id}-${index}`;
        selectedItems.add(key);
      }
    });
  });
  
  return selectedItems;
}


