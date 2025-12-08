'use client';

import { useState, useMemo } from 'react';
import { useDocumentStore } from '@/lib/store/document-store';
import type { TokenUsage } from '@/lib/utils/cost-calculator';
import type { Section } from '@/types/document';
import type { DocumentMode } from '@/types/document-mode';
import type { SkeletonItem } from '@/types/document';
import { getDefaultSelectedItems } from '@/lib/utils/skeleton-item-selection';
import { TH_INSTRUCTION_STRONG } from '@/lib/pinecone/constants';
import CostDisplay from './CostDisplay';
import SkeletonChatPanel from './SkeletonChatPanel';

export default function Step3Panel() {
  const {
    documentType,
    generatedContext,
    skeleton,
    selectedSkeletonItems,
    skeletonConfirmed,
    currentSkeletonItem,
    documentMode,
    terms,
    confirmSkeleton,
    setCurrentStep,
    setSkeleton,
    setDocumentMode,
    setSelectedSkeletonItems,
    setTerms,
    toggleSkeletonItem,
    selectAllSkeletonItems,
    deselectAllSkeletonItems,
    addCostRecord,
  } = useDocumentStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateSkeleton = async () => {
    if (!documentType) {
      setError('Тип документа не выбран');
      return;
    }

    if (!generatedContext) {
      setError('Сначала необходимо сгенерировать описание договора на шаге 2');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // Генерируем термины, если они еще не сгенерированы
      let currentTerms = terms;
      if (!currentTerms || currentTerms.length === 0) {
        try {
          const termsResponse = await fetch('/api/pipeline/terms-generation', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              document_type: documentType,
              generated_context: generatedContext,
            }),
          });

          if (!termsResponse.ok) {
            const errorData = await termsResponse.json();
            console.warn('Failed to generate terms:', errorData.error);
            // Продолжаем без терминов, если генерация не удалась
            currentTerms = null;
          } else {
            const termsData = await termsResponse.json();
            if (termsData.terms && Array.isArray(termsData.terms) && termsData.terms.length > 0) {
              currentTerms = termsData.terms;
              setTerms(currentTerms);
              
              // Отслеживаем затраты на генерацию терминов
              if (termsData.usage && termsData.model) {
                addCostRecord(termsData.model, termsData.usage, 'terms_generation');
              }
            } else {
              currentTerms = null;
            }
          }
        } catch (termsError) {
          console.warn('Error generating terms:', termsError);
          // Продолжаем без терминов, если генерация не удалась
          currentTerms = null;
        }
      }

      const response = await fetch('/api/pipeline/skeleton', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          document_type: documentType,
          generated_context: generatedContext,
          document_mode: documentMode,
          terms: currentTerms,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Ошибка при генерации скелета');
      }

      const data = await response.json();

      // Сохраняем скелет в store
      if (data.skeleton && Array.isArray(data.skeleton)) {
        setSkeleton(data.skeleton);
        // Автоматически выбираем пункты по умолчанию в зависимости от режима
        const defaultSelected = getDefaultSelectedItems(data.skeleton, documentMode);
        setSelectedSkeletonItems(defaultSelected);
      } else {
        throw new Error('Неверный формат ответа от сервера');
      }

      // Отслеживаем затраты
      if (data.usage && data.model) {
        addCostRecord(data.model, data.usage, 'skeleton');
      }
    } catch (err) {
      console.error('Error generating skeleton:', err);
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBack = () => {
    setCurrentStep('step2');
  };

  const handleConfirmSkeleton = () => {
    if (selectedSkeletonItems.size === 0) {
      setError('Выберите хотя бы один пункт для подтверждения');
      return;
    }
    confirmSkeleton();
  };

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

  const handleAllItemsProcessed = () => {
    // Все пункты обработаны, переходим к генерации текста документа
    setCurrentStep('step4');
  };

  // Если структура подтверждена, показываем двухпанельный layout
  if (skeletonConfirmed && skeleton) {
    return (
      <div className="h-screen flex bg-gray-50">
        {/* Левая панель: скелет (readonly) */}
        <div className="w-1/2 border-r border-gray-200 flex flex-col bg-white">
          <div className="p-4 border-b border-gray-200">
            <h1 className="text-2xl font-bold">Структура документа</h1>
            <p className="text-sm text-gray-600 mt-1">Выбранные пункты будут использованы для генерации текста</p>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              {skeleton.map((section: Section) => (
                <div key={section.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <h3 className="font-semibold text-gray-800 mb-2">{section.title}</h3>
                  {section.items && section.items.length > 0 ? (
                    <div className="space-y-2">
                      {section.items.map((item, index) => {
                        const itemKey = `${section.id}-${index}`;
                        const isChecked = selectedSkeletonItems.has(itemKey);
                        const isCurrent = currentSkeletonItem?.sectionId === section.id && 
                                         currentSkeletonItem?.itemIndex === index;
                        
                        return (
                          <div
                            key={index}
                            className={`flex items-start gap-2 p-2 rounded ${
                              isCurrent 
                                ? 'bg-blue-100 border-2 border-blue-500' 
                                : isChecked 
                                ? 'bg-green-50 border border-green-200' 
                                : 'bg-gray-100 border border-gray-200 opacity-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled
                              className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded"
                            />
                            <span className={`text-sm flex-1 ${
                              isCurrent ? 'font-semibold text-blue-900' : 'text-gray-700'
                            }`}>
                              {getItemText(item)}
                              {isCurrent && (
                                <span className="ml-2 text-xs text-blue-600">← Текущий пункт</span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic">Пункты не указаны</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Правая панель: чат */}
        <div className="w-1/2">
          <SkeletonChatPanel
            selectedItems={selectedItemsList}
            onAllItemsProcessed={handleAllItemsProcessed}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Шаг 3: Структура документа (скелет)</h1>
          <div className="flex items-center gap-4">
            <CostDisplay />
            <button
              onClick={handleBack}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
            >
              ← Назад к шагу 2
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
            </div>
          </div>

          {!skeleton && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold mb-4">Генерация структуры документа</h2>
              <p className="text-gray-600 mb-4">
                На основе сгенерированного описания договора будет создана полная структура документа
                с разделами и пунктами, включая все стандартные разделы, необходимые для данного типа договора.
              </p>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Режим генерации документа:
                </label>
                <select
                  value={documentMode}
                  onChange={(e) => setDocumentMode(e.target.value as DocumentMode)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="short">Краткий</option>
                  <option value="standard">Стандартный</option>
                  <option value="extended">Расширенный</option>
                  <option value="expert">Экспертный</option>
                </select>
                <p className="mt-2 text-xs text-gray-500">
                  {documentMode === 'short' && 'Минимальный набор разделов и пунктов'}
                  {documentMode === 'standard' && 'Типовой договор с полной структурой'}
                  {documentMode === 'extended' && 'Дополнительные пункты для рисков и гарантий'}
                  {documentMode === 'expert' && 'Максимально подробный каркас документа'}
                </p>
              </div>

              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700">{error}</p>
                </div>
              )}
              <button
                onClick={handleGenerateSkeleton}
                disabled={isGenerating || !documentType || !generatedContext}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isGenerating ? 'Генерация скелета...' : 'Сгенерировать структуру документа'}
              </button>
            </div>
          )}

          {skeleton && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Структура документа</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => selectAllSkeletonItems()}
                    className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium text-sm"
                  >
                    Выбрать все
                  </button>
                  <button
                    onClick={() => deselectAllSkeletonItems()}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm"
                  >
                    Снять все
                  </button>
                  <button
                    onClick={handleGenerateSkeleton}
                    disabled={isGenerating}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? 'Регенерация...' : 'Регенерировать'}
                  </button>
                </div>
              </div>
              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700">{error}</p>
                </div>
              )}
              {selectedSkeletonItems.size > 0 && (
                <div className="mb-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={handleConfirmSkeleton}
                    className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                  >
                    Подтвердить структуру ({selectedSkeletonItems.size} пунктов выбрано)
                  </button>
                </div>
              )}
              <div className="space-y-4">
                {skeleton.map((section: Section) => {
                  const sectionItemKeys = section.items.map((_, index) => `${section.id}-${index}`);
                  const sectionSelectedCount = sectionItemKeys.filter((key) =>
                    selectedSkeletonItems.has(key)
                  ).length;
                  const isSectionAllSelected = section.items.length > 0 && sectionSelectedCount === section.items.length;
                  const isSectionSomeSelected = sectionSelectedCount > 0 && sectionSelectedCount < section.items.length;

                  return (
                    <div key={section.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-800">{section.title}</h3>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => selectAllSkeletonItems(section.id)}
                            className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 font-medium"
                          >
                            Выбрать все
                          </button>
                          <button
                            onClick={() => deselectAllSkeletonItems(section.id)}
                            className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200 font-medium"
                          >
                            Снять все
                          </button>
                        </div>
                      </div>
                      {section.items && section.items.length > 0 ? (
                        <div className="space-y-2">
                          {section.items.map((item, index) => {
                            const itemKey = `${section.id}-${index}`;
                            const isChecked = selectedSkeletonItems.has(itemKey);
                            
                            return (
                              <label
                                key={index}
                                className="flex items-start gap-2 cursor-pointer hover:bg-gray-100 p-2 rounded -ml-2"
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleSkeletonItem(section.id, index)}
                                  className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700 flex-1">{getItemText(item)}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic">Пункты не указаны</p>
                      )}
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

