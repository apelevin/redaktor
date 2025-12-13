'use client';

import { useState } from 'react';
import { useDocumentStore } from '@/lib/store/document-store';
import type { TokenUsage } from '@/lib/utils/cost-calculator';
import CostDisplay from './CostDisplay';

export default function Step2Panel() {
  const {
    documentType,
    context,
    questions,
    answers,
    generatedContext,
    setCurrentStep,
    setGeneratedContext,
    addCostRecord,
  } = useDocumentStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateContext = async () => {
    if (!documentType) {
      setError('Тип документа не выбран');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // Формируем историю вопросов и ответов
      const qaHistory = questions.map((question) => {
        const answer = answers.find((a) => a.questionId === question.id);
        return {
          question: question.text,
          answer: answer ? answer.answer : 'Ответ не предоставлен',
        };
      });

      const response = await fetch('/api/pipeline/context-generation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          document_type: documentType,
          context: context,
          qa_history: qaHistory,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Ошибка при генерации контекста');
      }

      const data = await response.json();

      // Сохраняем сгенерированный контекст
      if (data.generatedContext) {
        setGeneratedContext(data.generatedContext);
      } else {
        throw new Error('Неверный формат ответа от сервера');
      }

      // Отслеживаем затраты
      if (data.usage && data.model) {
        addCostRecord(data.model, data.usage, 'context_generation');
      }
    } catch (err) {
      console.error('Error generating context:', err);
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBack = () => {
    setCurrentStep('step1');
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Шаг 2: Генерация контекста договора</h1>
          <div className="flex items-center gap-4">
            <CostDisplay />
            <button
              onClick={handleBack}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
            >
              ← Назад к шагу 1
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
                <span className="font-medium text-gray-700">Количество вопросов:</span>{' '}
                <span className="text-gray-900">{questions.length}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Количество ответов:</span>{' '}
                <span className="text-gray-900">{answers.length}</span>
              </div>
            </div>
          </div>

          {!generatedContext && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold mb-4">Генерация полного описания договора</h2>
              <p className="text-gray-600 mb-4">
                На основе собранного диалога будет создано полное, структурированное описание договора,
                включающее все детали, которые были обсуждены.
              </p>
              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700">{error}</p>
                </div>
              )}
              <button
                onClick={handleGenerateContext}
                disabled={isGenerating || !documentType}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isGenerating ? 'Генерация контекста...' : 'Сгенерировать описание договора'}
              </button>
            </div>
          )}

          {generatedContext && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Сгенерированное описание договора</h2>
                <button
                  onClick={handleGenerateContext}
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
              <div className="prose max-w-none">
                <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">
                    {generatedContext}
                  </pre>
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={() => setCurrentStep('step3')}
                  className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                >
                  Шаг 3: Генерация скелета документа →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

