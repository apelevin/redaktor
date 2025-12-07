import type { Section, Clause, DocumentState } from '@/types/document';

export interface AssembledDocument {
  sections: Array<{
    section: Section;
    clause?: Clause;
    content: string;
  }>;
  fullText: string;
}

/**
 * Собирает финальный документ из skeleton и clauses
 */
export function assembleDocument(state: DocumentState): AssembledDocument {
  const sections: AssembledDocument['sections'] = [];
  
  // Рекурсивная функция для обхода skeleton
  function processSection(section: Section, level: number = 0): void {
    const clause = state.clauses.find(c => c.sectionId === section.id);
    
    let content = '';
    
    // Добавляем заголовок раздела
    const indent = '  '.repeat(level);
    content += `${indent}${section.title}\n\n`;
    
    // Добавляем содержимое клаузы, если есть
    if (clause) {
      content += `${indent}${clause.content}\n\n`;
    }
    
    sections.push({
      section,
      clause,
      content: content.trim(),
    });
    
    // Обрабатываем подразделы
    if (section.subsections) {
      for (const subsection of section.subsections) {
        processSection(subsection, level + 1);
      }
    }
  }
  
  // Обрабатываем все разделы skeleton
  for (const section of state.skeleton) {
    processSection(section);
  }
  
  // Формируем полный текст
  const fullText = sections
    .map(s => s.content)
    .join('\n\n');
  
  return {
    sections,
    fullText,
  };
}

/**
 * Форматирует документ для отображения с метаданными
 */
export function formatDocumentForDisplay(assembled: AssembledDocument): string {
  return assembled.sections
    .map(s => {
      let text = s.content;
      
      if (s.clause) {
        const sourceLabel = s.clause.source === 'rag' ? '[RAG]' : '[LLM]';
        text += `\n\n${sourceLabel}`;
        
        if (s.clause.metadata?.sourceType) {
          text += ` (${s.clause.metadata.sourceType})`;
        }
      }
      
      return text;
    })
    .join('\n\n');
}


