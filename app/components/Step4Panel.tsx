'use client';

import { useState, useEffect, useMemo } from 'react';
import { useDocumentStore } from '@/lib/store/document-store';
import type { TokenUsage } from '@/lib/utils/cost-calculator';
import type { Section } from '@/types/document';
import type { DocumentMode } from '@/types/document-mode';
import type { SkeletonItem } from '@/types/document';
import CostDisplay from './CostDisplay';
import InstructionView from './InstructionView';

export default function Step4Panel() {
  const {
    documentType,
    generatedContext,
    skeleton,
    selectedSkeletonItems,
    skeletonItemAnswers,
    documentClauses,
    generatedDocument,
    documentMode,
    outputTextMode,
    terms,
    instruction,
    jurisdiction,
    questions,
    instructionPineconeId,
    setCurrentStep,
    setOutputTextMode,
    addDocumentClause,
    setGeneratedDocument,
    addCostRecord,
    setInstruction,
    setInstructionPineconeId,
  } = useDocumentStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [generationComplete, setGenerationComplete] = useState(false);
  const [activeTab, setActiveTab] = useState<'document' | 'instruction'>('document');
  const [isGeneratingInstruction, setIsGeneratingInstruction] = useState(false);
  const [instructionError, setInstructionError] = useState<string | null>(null);
  const [isSavingInstruction, setIsSavingInstruction] = useState(false);
  const [saveInstructionError, setSaveInstructionError] = useState<string | null>(null);

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
        sections.push(`## ${section.title}\n`);
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

  const handleGenerateInstruction = async () => {
    if (!documentType || !skeleton) {
      setInstructionError('Недостаточно данных для генерации инструкции');
      return;
    }

    setIsGeneratingInstruction(true);
    setInstructionError(null);

    try {
      const response = await fetch('/api/instruction/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentType,
          generatedDocument,
          documentClauses,
          skeleton,
          questions: questions || [],
          skeletonItemAnswers,
          terms,
          generatedContext,
          jurisdiction: jurisdiction || 'RU',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Ошибка при генерации инструкции');
      }

      const data = await response.json();

      // Сохраняем инструкцию в store
      if (data.instruction) {
        setInstruction(data.instruction);
      }

      // Отслеживаем затраты
      if (data.usage && data.model) {
        addCostRecord(data.model, data.usage as TokenUsage, 'instruction_generation');
      }
    } catch (err) {
      console.error('Error generating instruction:', err);
      setInstructionError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setIsGeneratingInstruction(false);
    }
  };

  const handleSaveInstructionToPinecone = async () => {
    if (!instruction) {
      setSaveInstructionError('Инструкция не найдена');
      return;
    }

    setIsSavingInstruction(true);
    setSaveInstructionError(null);

    try {
      const response = await fetch('/api/instruction/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instruction,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Ошибка при сохранении инструкции');
      }

      const data = await response.json();
      
      // Сохраняем ID инструкции в store
      if (data.id) {
        setInstructionPineconeId(data.id);
      }
    } catch (err) {
      console.error('Error saving instruction to Pinecone:', err);
      setSaveInstructionError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setIsSavingInstruction(false);
    }
  };

  const handleDownloadMarkdown = () => {
    // Используем generatedDocument, если он есть, иначе собираем из documentClauses
    let documentText = generatedDocument;
    
    if (!documentText) {
      // Собираем документ из clauses, если generatedDocument еще не собран
      if (!skeleton) return;
      
      const sections: string[] = [];
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

        if (hasItems) {
          sections.push(`## ${section.title}\n`);
          sections.push(...sectionTexts);
        }
      });
      
      documentText = sections.join('\n\n');
    }

    if (!documentText || documentText.trim().length === 0) {
      setError('Нет текста документа для скачивания');
      return;
    }

    // Создаем Blob с текстом в формате Markdown
    const blob = new Blob([documentText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // Создаем временную ссылку для скачивания
    const link = document.createElement('a');
    link.href = url;
    const fileName = `${documentType || 'document'}_${new Date().toISOString().split('T')[0]}.md`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    
    // Очищаем
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
        
        {/* Вкладки */}
        {generationComplete && (
          <div className="flex gap-2 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('document')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'document'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Документ
            </button>
            <button
              onClick={() => setActiveTab('instruction')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'instruction'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Инструкция
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Контент вкладки "Инструкция" */}
          {activeTab === 'instruction' && generationComplete && (
            <div>
              {instruction ? (
                <>
                  <InstructionView instruction={instruction} />
                  
                  {/* Кнопка сохранения и статус */}
                  <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          Сохранение в базу знаний
                        </h3>
                        {instructionPineconeId ? (
                          <div className="flex items-center gap-2 text-green-700">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-sm font-medium">
                              Инструкция сохранена в базу знаний
                            </span>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-600">
                            Сохраните инструкцию в базу знаний для использования в будущем
                          </p>
                        )}
                        {instructionPineconeId && (
                          <p className="text-xs text-gray-500 mt-1">
                            ID: {instructionPineconeId}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {saveInstructionError && (
                      <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-red-700 text-sm">{saveInstructionError}</p>
                      </div>
                    )}
                    
                    <button
                      onClick={handleSaveInstructionToPinecone}
                      disabled={isSavingInstruction || !!instructionPineconeId}
                      className={`w-full px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                        instructionPineconeId
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : isSavingInstruction
                          ? 'bg-blue-400 text-white cursor-not-allowed'
                          : 'bg-green-600 text-white hover:bg-green-700'
                      }`}
                    >
                      {isSavingInstruction ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                          <span>Сохранение...</span>
                        </>
                      ) : instructionPineconeId ? (
                        <>
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <span>Сохранено</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                          </svg>
                          <span>Сохранить в базу знаний</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <h2 className="text-xl font-semibold mb-4">Инструкция по документу</h2>
                  <p className="text-gray-600 mb-4">
                    Инструкция поможет понять структуру и требования к документам этого типа для будущего использования.
                  </p>
                  
                  {instructionError && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-red-700">{instructionError}</p>
                    </div>
                  )}
                  
                  <button
                    onClick={handleGenerateInstruction}
                    disabled={isGeneratingInstruction}
                    className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isGeneratingInstruction ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span>Генерация инструкции...</span>
                      </>
                    ) : (
                      <span>Сгенерировать инструкцию</span>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
          
          {/* Контент вкладки "Документ" */}
          {activeTab === 'document' && (
            <>
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
              <div className="flex items-center justify-between">
                <p className="font-medium text-green-900">
                  ✓ Генерация документа завершена
                </p>
                <button
                  onClick={handleDownloadMarkdown}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Скачать Markdown
                </button>
              </div>
            </div>
          )}

          {/* Отображение сгенерированных текстов */}
          {Object.keys(documentClauses).length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Сгенерированный текст документа</h2>
                <button
                  onClick={handleDownloadMarkdown}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
                  disabled={!generatedDocument && Object.keys(documentClauses).length === 0}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Скачать Markdown
                </button>
              </div>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}


