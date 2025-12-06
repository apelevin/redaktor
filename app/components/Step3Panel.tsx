'use client';

import { useState } from 'react';
import { useDocumentStore } from '@/lib/store/document-store';
import type { TokenUsage } from '@/lib/utils/cost-calculator';
import type { Section } from '@/types/document';
import CostDisplay from './CostDisplay';

export default function Step3Panel() {
  const {
    documentType,
    generatedContext,
    skeleton,
    setCurrentStep,
    setSkeleton,
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
      const response = await fetch('/api/pipeline/skeleton', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          document_type: documentType,
          generated_context: generatedContext,
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
                <button
                  onClick={handleGenerateSkeleton}
                  disabled={isGenerating}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  {isGenerating ? 'Регенерация...' : 'Регенерировать'}
                </button>
              </div>
              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700">{error}</p>
                </div>
              )}
              <div className="space-y-4">
                {skeleton.map((section: Section) => (
                  <div key={section.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h3 className="font-semibold text-gray-800 mb-2">{section.title}</h3>
                    {section.items && section.items.length > 0 ? (
                      <ul className="list-disc list-inside space-y-1 ml-4">
                        {section.items.map((item, index) => (
                          <li key={index} className="text-sm text-gray-700">
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-500 italic">Пункты не указаны</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

