/**
 * Профили обязательных полей для разных типов документов
 * Используется для оптимизации сбора контекста через вопросы
 */

export type ContextFieldId =
  | 'parties'
  | 'subject'
  | 'term'
  | 'price'
  | 'delivery_terms'
  | 'responsibility'
  | 'termination'
  | 'special_type_field';

export interface ContextField {
  id: ContextFieldId;
  label: string; // человекочитаемое имя, для промпта
  critical: boolean; // критично ли для старта skeleton
}

export interface DocumentTypeProfile {
  document_type: string;
  fields: ContextField[];
}

export interface QA {
  question: string;
  answer: string;
}

export interface MissingFieldInfo {
  id: ContextFieldId;
  label: string;
  critical: boolean;
}

/**
 * Профили полей для разных типов документов
 */
export const CONTEXT_PROFILES: DocumentTypeProfile[] = [
  {
    document_type: 'договор поставки',
    fields: [
      { id: 'parties', label: 'Стороны договора', critical: true },
      { id: 'subject', label: 'Предмет и тип товара', critical: true },
      { id: 'delivery_terms', label: 'Базовые условия поставки и график', critical: true },
      { id: 'price', label: 'Подход к цене и расчетам (фикс/диапазон/формула)', critical: true },
      { id: 'term', label: 'Срок действия договора (примерно)', critical: false },
      { id: 'responsibility', label: 'Особые пожелания по ответственности/штрафам', critical: false },
    ],
  },
  {
    document_type: 'договор подряда',
    fields: [
      { id: 'parties', label: 'Стороны договора', critical: true },
      { id: 'subject', label: 'Предмет подряда и объем работ', critical: true },
      { id: 'term', label: 'Сроки выполнения работ', critical: true },
      { id: 'price', label: 'Стоимость работ и порядок оплаты', critical: true },
      { id: 'responsibility', label: 'Особые пожелания по ответственности/штрафам', critical: false },
      { id: 'termination', label: 'Условия расторжения договора', critical: false },
    ],
  },
  {
    document_type: 'NDA',
    fields: [
      { id: 'parties', label: 'Стороны соглашения', critical: true },
      { id: 'subject', label: 'Предмет конфиденциальной информации', critical: true },
      { id: 'term', label: 'Срок действия соглашения', critical: true },
      { id: 'responsibility', label: 'Ответственность за нарушение', critical: false },
    ],
  },
  // Базовый профиль для неизвестных типов документов
  {
    document_type: 'default',
    fields: [
      { id: 'parties', label: 'Стороны договора', critical: true },
      { id: 'subject', label: 'Предмет договора', critical: true },
      { id: 'term', label: 'Срок действия', critical: false },
      { id: 'price', label: 'Финансовые условия', critical: false },
    ],
  },
];

/**
 * Маппинг полей на ключевые слова для более точного определения покрытия
 */
const FIELD_KEYWORDS: Record<ContextFieldId, string[]> = {
  parties: ['стороны', 'сторона', 'заказчик', 'подрядчик', 'поставщик', 'покупатель', 'исполнитель', 'наименование', 'инн', 'адрес'],
  subject: ['предмет', 'товар', 'услуга', 'работа', 'продукция', 'оборудование', 'материал', 'объем', 'характеристики'],
  term: ['срок', 'период', 'действие', 'дата', 'время', 'длительность', 'календарь'],
  price: ['цена', 'стоимость', 'оплата', 'платеж', 'расчет', 'тариф', 'ставка', 'сумма', 'деньги'],
  delivery_terms: ['поставка', 'доставка', 'отгрузка', 'график', 'сроки поставки', 'условия поставки', 'базис поставки'],
  responsibility: ['ответственность', 'штраф', 'неустойка', 'пеня', 'санкции', 'возмещение', 'ущерб'],
  termination: ['расторжение', 'прекращение', 'денонсация', 'отказ', 'выход'],
  special_type_field: [],
};

/**
 * Вычисляет недостающие поля на основе профиля документа и собранного контекста
 */
export function computeMissingFields(
  document_type: string,
  qa_context: QA[]
): MissingFieldInfo[] {
  // Находим профиль для данного типа документа
  const profile = CONTEXT_PROFILES.find(
    p => p.document_type.toLowerCase() === document_type.toLowerCase()
  ) || CONTEXT_PROFILES.find(p => p.document_type === 'default');

  if (!profile) {
    return [];
  }

  // Объединяем весь текст из вопросов и ответов
  const allText = qa_context
    .map(qa => `${qa.question}\n${qa.answer}`)
    .join('\n')
    .toLowerCase();

  // Проверяем, покрыто ли поле
  const isFieldCovered = (field: ContextField): boolean => {
    // Проверяем по label
    if (allText.includes(field.label.toLowerCase())) {
      return true;
    }

    // Проверяем по ключевым словам
    const keywords = FIELD_KEYWORDS[field.id] || [];
    const hasKeyword = keywords.some(keyword => 
      allText.includes(keyword.toLowerCase())
    );

    // Дополнительная проверка: если в вопросах уже была тема, считаем её покрытой
    // Это помогает избежать повторных вопросов даже при кратких ответах
    const questionTexts = qa_context.map(qa => qa.question.toLowerCase()).join(' ');
    const questionHasTopic = keywords.some(keyword => 
      questionTexts.includes(keyword.toLowerCase())
    );
    
    // Если тема была в вопросе И есть какой-то ответ (даже краткий), считаем покрытой
    if (questionHasTopic) {
      // Проверяем, есть ли ответ на этот вопрос
      const hasAnswer = qa_context.some(qa => {
        const q = qa.question.toLowerCase();
        const a = (qa.answer && typeof qa.answer === 'string' ? qa.answer : Array.isArray(qa.answer) ? qa.answer.join(' ') : '').toLowerCase();
        // Проверяем, что вопрос содержит ключевые слова темы
        const questionMatches = keywords.some(keyword => q.includes(keyword.toLowerCase()));
        // И есть непустой ответ
        return questionMatches && a.trim().length > 0;
      });
      
      if (hasAnswer) {
        return true;
      }
    }

    return hasKeyword;
  };

  // Возвращаем только непокрытые поля
  return profile.fields
    .filter(field => !isFieldCovered(field))
    .map(field => ({
      id: field.id,
      label: field.label,
      critical: field.critical,
    }));
}

/**
 * Получить профиль для типа документа
 */
export function getProfileForDocumentType(document_type: string): DocumentTypeProfile | null {
  return CONTEXT_PROFILES.find(
    p => p.document_type.toLowerCase() === document_type.toLowerCase()
  ) || CONTEXT_PROFILES.find(p => p.document_type === 'default') || null;
}

