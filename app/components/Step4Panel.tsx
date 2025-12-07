'use client';

import { useState, useEffect, useMemo } from 'react';
import { useDocumentStore } from '@/lib/store/document-store';
import type { TokenUsage } from '@/lib/utils/cost-calculator';
import type { Section } from '@/types/document';
import type { DocumentMode } from '@/types/document-mode';
import type { SkeletonItem } from '@/types/document';
import CostDisplay from './CostDisplay';

export default function Step4Panel() {
  const {
    documentType,
    generatedContext,
    skeleton,
    selectedSkeletonItems,
    skeletonItemAnswers,
    documentClauses,
    documentMode,
    outputTextMode,
    terms,
    setCurrentStep,
    setOutputTextMode,
    addDocumentClause,
    setGeneratedDocument,
    addCostRecord,
  } = useDocumentStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [generationComplete, setGenerationComplete] = useState(false);

  // Получаем текст пункта, учитывая обратную совместимость
  const getItemText = (item: SkeletonItem | string): string => {
    return typeof item === 'string' ? item : item.text;
  };

  // Получаем список выбранных пунктов с их информацией
  const selectedItemsList = useMemo(() => {
    if (!skeleton) return [];
    
    const items: Array<{ sectionId: string; itemIndex: number; sectionTitle: string; itemText: string }> = [];
    
    skeleton.forEach((section) => {
      section.items.forEach((item, index) => {
        const itemKey = `${section.id}-${index}`;
        if (selectedSkeletonItems.has(itemKey)) {
          items.push({
            sectionId: section.id,
            itemIndex: index,
            sectionTitle: section.title,
            itemText: getItemText(item),
          });
        }
      });
    });
    
    return items;
  }, [skeleton, selectedSkeletonItems]);

  // Автоматически начинаем генерацию при монтировании компонента
  useEffect(() => {
    if (selectedItemsList.length > 0 && !isGenerating && !generationComplete && currentItemIndex === 0) {
      startGeneration();
    }
  }, []);

  const startGeneration = async () => {
    if (selectedItemsList.length === 0) {
      setError('Нет выбранных пунктов для генерации');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setCurrentItemIndex(0);
    setGenerationComplete(false);

    // Генерируем текст для каждого пункта последовательно
    await generateNextItem(0);
  };

  const generateNextItem = async (index: number) => {
    if (index >= selectedItemsList.length) {
      // Все пункты обработаны - собираем полный текст
      assembleFullDocument();
      setIsGenerating(false);
      setGenerationComplete(true);
      return;
    }

    const item = selectedItemsList[index];
    const itemKey = `${item.sectionId}-${item.itemIndex}`;

    // Проверяем, не сгенерирован ли уже текст для этого пункта
    if (documentClauses[itemKey]) {
      // Пропускаем уже сгенерированные пункты
      setCurrentItemIndex(index + 1);
      setTimeout(() => generateNextItem(index + 1), 100);
      return;
    }

    try {
      const response = await fetch('/api/pipeline/document-item-generation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          document_type: documentType,
          generated_context: generatedContext,
          section_title: item.sectionTitle,
          section_id: item.sectionId,
          item_text: item.itemText,
          item_index: item.itemIndex,
          item_answers: skeletonItemAnswers[itemKey] || null,
          existing_clauses: documentClauses,
          document_mode: outputTextMode || documentMode,
          terms: terms,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Ошибка при генерации текста');
      }

      const data = await response.json();

      // Сохраняем сгенерированный текст
      if (data.generatedText) {
        addDocumentClause(item.sectionId, item.itemIndex, data.generatedText);
      }

      // Отслеживаем затраты
      if (data.usage && data.model) {
        addCostRecord(data.model, data.usage as TokenUsage, 'document_generation');
      }

      // Переходим к следующему пункту
      setCurrentItemIndex(index + 1);
      setTimeout(() => generateNextItem(index + 1), 100);
    } catch (err) {
      console.error('Error generating document item:', err);
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
      setIsGenerating(false);
    }
  };

  const assembleFullDocument = () => {
    if (!skeleton) return;

    const sections: string[] = [];
    const processedSections = new Set<string>();

    // Проходим по скелету и собираем тексты по разделам
    skeleton.forEach((section) => {
      const sectionTexts: string[] = [];
      let hasItems = false;

      section.items.forEach((item, index) => {
        const itemKey = `${section.id}-${index}`;
        if (selectedSkeletonItems.has(itemKey) && documentClauses[itemKey]) {
          sectionTexts.push(documentClauses[itemKey]);
          hasItems = true;
        }
      });

      if (hasItems && !processedSections.has(section.id)) {
        sections.push(`\n${section.title}\n`);
        sections.push(...sectionTexts);
        processedSections.add(section.id);
      }
    });

    const fullText = sections.join('\n\n');
    setGeneratedDocument(fullText);
  };

  const handleBack = () => {
    setCurrentStep('step3');
  };

  const currentItem = selectedItemsList[currentItemIndex];
  const progress = selectedItemsList.length > 0 
    ? `${currentItemIndex + 1} из ${selectedItemsList.length}`
    : '0 из 0';

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Шаг 4: Генерация текста документа</h1>
          <div className="flex items-center gap-4">
            <CostDisplay />
            <button
              onClick={handleBack}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
            >
              ← Назад к шагу 3
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-4">Информация о документе</h2>
            <div className="space-y-2">
              <div>
                <span className="font-medium text-gray-700">Тип документа:</span>{' '}
                <span className="text-gray-900">{documentType || 'Не указан'}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Выбрано пунктов:</span>{' '}
                <span className="text-gray-900">{selectedItemsList.length}</span>
              </div>
            </div>
            
            {!isGenerating && !generationComplete && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Режим генерации текста:
                </label>
                <select
                  value={outputTextMode || documentMode}
                  onChange={(e) => setOutputTextMode(e.target.value as DocumentMode)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="short">Краткий</option>
                  <option value="standard">Стандартный</option>
                  <option value="extended">Расширенный</option>
                  <option value="expert">Экспертный</option>
                </select>
                <p className="mt-2 text-xs text-gray-500">
                  {outputTextMode || documentMode === 'short' && '1 абзац или 3-6 предложений, кратко и ёмко'}
                  {(outputTextMode || documentMode) === 'standard' && '1-2 абзаца, обычная детализация'}
                  {(outputTextMode || documentMode) === 'extended' && '2-3 абзаца, подробное описание'}
                  {(outputTextMode || documentMode) === 'expert' && '3+ абзаца, максимальная детализация'}
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {isGenerating && currentItem && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-blue-900">
                  Генерация пункта {progress}
                </p>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              </div>
              <p className="text-sm text-blue-700">
                <span className="font-medium">Раздел:</span> {currentItem.sectionTitle}
              </p>
              <p className="text-sm text-blue-700">
                <span className="font-medium">Пункт:</span> {currentItem.itemText}
              </p>
            </div>
          )}

          {generationComplete && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="font-medium text-green-900">
                ✓ Генерация документа завершена
              </p>
            </div>
          )}

          {/* Отображение сгенерированных текстов */}
          {Object.keys(documentClauses).length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold mb-4">Сгенерированный текст документа</h2>
              <div className="space-y-6">
                {skeleton?.map((section) => {
                  const sectionItems = section.items
                    .map((item, index) => {
                      const itemKey = `${section.id}-${index}`;
                      if (selectedSkeletonItems.has(itemKey) && documentClauses[itemKey]) {
                        return { item: getItemText(item), text: documentClauses[itemKey] };
                      }
                      return null;
                    })
                    .filter(Boolean) as Array<{ item: string; text: string }>;

                  if (sectionItems.length === 0) return null;

                  return (
                    <div key={section.id} className="border-b border-gray-200 pb-4 last:border-b-0 last:pb-0">
                      <h3 className="font-semibold text-lg mb-3 text-gray-800">{section.title}</h3>
                      <div className="space-y-4">
                        {sectionItems.map(({ item, text }, idx) => (
                          <div key={idx} className="bg-gray-50 p-4 rounded-lg">
                            <p className="text-sm font-medium text-gray-600 mb-2">{item}</p>
                            <p className="text-gray-800 whitespace-pre-wrap">{text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


