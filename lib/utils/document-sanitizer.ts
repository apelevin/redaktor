import type { TermsDictionary } from '@/types/terms';

/**
 * Словарь плейсхолдеров для анонимизации
 */
interface PlaceholderMap {
  [key: string]: string; // реальное значение -> плейсхолдер
}

/**
 * Строит словарь плейсхолдеров на основе терминов
 */
function buildPlaceholderMap(terms: TermsDictionary | null): PlaceholderMap {
  const map: PlaceholderMap = {};
  
  if (!terms || terms.length === 0) {
    return map;
  }
  
  terms.forEach((term, index) => {
    // Используем имя термина как ключ для плейсхолдера
    const placeholderKey = term.name.toUpperCase().replace(/[^А-ЯA-Z0-9]/g, '_');
    
    // Создаем плейсхолдер на основе роли термина
    let placeholder: string;
    
    if (term.role === 'party') {
      placeholder = `{PARTY_${index + 1}_${placeholderKey}}`;
    } else if (term.role === 'contract') {
      placeholder = `{CONTRACT_${placeholderKey}}`;
    } else if (term.role === 'service') {
      placeholder = `{SERVICE_${placeholderKey}}`;
    } else if (term.role === 'document') {
      placeholder = `{DOC_${placeholderKey}}`;
    } else if (term.role === 'main_object') {
      placeholder = `{OBJECT_${placeholderKey}}`;
    } else {
      placeholder = `{${placeholderKey}}`;
    }
    
    // Добавляем маппинг для имени термина
    map[term.name] = placeholder;
    
    // Добавляем маппинг для определения термина (может содержать реальные данные)
    if (term.definition) {
      map[term.definition] = placeholder;
    }
  });
  
  return map;
}

/**
 * Экранирует специальные символы в регулярных выражениях
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Анонимизирует документ, заменяя персональные и конкретные данные на плейсхолдеры
 */
export function sanitizeDocument(
  document: string,
  terms: TermsDictionary | null
): string {
  let sanitized = document;
  
  // Строим словарь плейсхолдеров из терминов
  const placeholderMap = buildPlaceholderMap(terms);
  
  // Заменяем известные термины на плейсхолдеры (от длинных к коротким, чтобы избежать частичных замен)
  const sortedEntries = Object.entries(placeholderMap).sort((a, b) => b[0].length - a[0].length);
  
  for (const [original, placeholder] of sortedEntries) {
    // Используем глобальную замену с учетом регистра
    const regex = new RegExp(escapeRegex(original), 'gi');
    sanitized = sanitized.replace(regex, placeholder);
  }
  
  // Дополнительная анонимизация паттернов
  
  // Суммы денег: "1 500 000 рублей" -> "{AMOUNT}"
  sanitized = sanitized.replace(/\d+[\s,.]*\d*[\s,.]*\d*\s*(?:рубл[ейя]|руб\.?|₽)/gi, '{AMOUNT}');
  
  // Проценты: "10%" -> "{PERCENT}"
  sanitized = sanitized.replace(/\d+[.,]?\d*\s*%/g, '{PERCENT}');
  
  // Даты: "01.01.2024" или "1 января 2024" -> "{DATE}"
  sanitized = sanitized.replace(/\d{1,2}[./]\d{1,2}[./]\d{2,4}/g, '{DATE}');
  sanitized = sanitized.replace(/\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+\d{4}/gi, '{DATE}');
  
  // Номера телефонов
  sanitized = sanitized.replace(/\+?\d[\d\s\-()]{7,}\d/g, '{PHONE}');
  
  // Email адреса
  sanitized = sanitized.replace(/[\w.-]+@[\w.-]+\.\w+/g, '{EMAIL}');
  
  // ИНН, ОГРН и подобные номера (10-15 цифр)
  sanitized = sanitized.replace(/\b\d{10,15}\b/g, (match) => {
    // Проверяем длину - если это похоже на ИНН/ОГРН
    if (match.length >= 10 && match.length <= 15) {
      return '{REG_NUMBER}';
    }
    return match;
  });
  
  // VIN номера (17 символов, буквы и цифры)
  sanitized = sanitized.replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi, '{VIN}');
  
  // Госномера автомобилей (формат: А123БВ777 или подобный)
  sanitized = sanitized.replace(/\b[АВЕКМНОРСТУХABEKMHOPCTYX]\d{3}[АВЕКМНОРСТУХABEKMHOPCTYX]{2}\d{2,3}\b/gi, '{REG_NUMBER}');
  
  // Адреса (упрощенная проверка на наличие "ул.", "д.", "г." и т.п.)
  sanitized = sanitized.replace(/(?:ул\.|улица|пр\.|проспект|пер\.|переулок|д\.|дом|кв\.|квартира|г\.|город|обл\.|область)[\s\w,.-]+/gi, '{ADDRESS}');
  
  // ФИО (паттерны: "Иванов И.И." или "Иван Иванов")
  sanitized = sanitized.replace(/[А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.\s*[А-ЯЁ]\./g, '{PARTY_NAME}');
  sanitized = sanitized.replace(/\b[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\b/g, '{PARTY_NAME}');
  
  // Названия организаций (ООО, ИП, ЗАО и т.д.)
  sanitized = sanitized.replace(/(?:ООО|ИП|ЗАО|ОАО|ПАО|АО)\s*[«"]?[А-ЯЁа-яё\w\s-]+[»"]?/gi, '{PARTY_COMPANY}');
  
  return sanitized;
}

