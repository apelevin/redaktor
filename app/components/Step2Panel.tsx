'use client';

import { useState } from 'react';
import { useDocumentStore } from '@/lib/store/document-store';
import type { TokenUsage } from '@/lib/utils/cost-calculator';
import type { Instruction } from '@/types/instruction';
import type { Section } from '@/types/document';
import { getDefaultSelectedItems } from '@/lib/utils/skeleton-item-selection';
import CostDisplay from './CostDisplay';

interface InstructionCandidate {
  id: string;
  score: number;
  instruction: Instruction | null;
}

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
    jurisdiction,
    setInstructionMatch,
    setSkeleton,
    setSelectedSkeletonItems,
    documentMode,
  } = useDocumentStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instructionError, setInstructionError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [candidates, setCandidates] = useState<InstructionCandidate[]>([]);

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

  const handleSearchInstructions = async () => {
    if (!documentType) return;
    setIsSearching(true);
    setInstructionError(null);
    try {
      const resp = await fetch('/api/instruction/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentType,
          jurisdiction: jurisdiction || 'RU',
          shortDescription: generatedContext || '',
          documentMode,
        }),
      });
      if (!resp.ok) {
        const errData = await resp.json();
        throw new Error(errData.error || 'Ошибка при поиске инструкций');
      }
      const data = await resp.json();
      setCandidates(data.candidates || []);
    } catch (err) {
      console.error('Error searching instructions:', err);
      setInstructionError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setIsSearching(false);
    }
  };

  const handleUseInstruction = (cand: InstructionCandidate) => {
    if (!cand.instruction) {
      setInstructionError('Инструкция не загружена');
      return;
    }
    setInstructionMatch({
      id: cand.id,
      score: cand.score,
      instruction: cand.instruction,
    });
    // Проставляем скелет из инструкции сразу, чтобы не дергать OpenAI на шаге 3
    const skel: Section[] = cand.instruction.recommendedStructure.map((sec) => ({
      id: sec.sectionKey || sec.title,
      title: sec.title,
      items: [{ text: sec.description, importance: sec.isMandatory ? 'must' : 'recommended' }],
    }));
    setSkeleton(skel);
    setSelectedSkeletonItems(getDefaultSelectedItems(skel, documentMode || 'short'));
    setCurrentStep('step3');
  };

  const handleUseOpenAI = () => {
    setInstructionMatch(null);
    setCurrentStep('step3');
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Шаг 2: Генерация контекста договора</h1>
          <div className="flex items-center gap-4">
            <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
              Режим: {documentMode}
            </span>
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
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold">Инструкции из базы (Pinecone)</h3>
                  <button
                    onClick={handleSearchInstructions}
                    disabled={isSearching}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {isSearching ? 'Ищем...' : 'Проверить инструкции'}
                  </button>
                </div>
                {instructionError && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {instructionError}
                  </div>
                )}
                {candidates.length === 0 && !isSearching && (
                  <p className="text-sm text-gray-600">Пока ничего не найдено.</p>
                )}
                {candidates.length > 0 && (
                  <div className="space-y-3">
                    {candidates.map((cand) => (
                      <div key={cand.id} className="border border-gray-200 rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-sm text-gray-500">ID: {cand.id}</div>
                          <div className="text-base font-medium text-gray-900">Score: {cand.score.toFixed(3)}</div>
                          {cand.instruction?.whenToUse && (
                            <div className="text-sm text-gray-700">
                              Когда использовать: {cand.instruction.whenToUse}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUseInstruction(cand)}
                            disabled={!cand.instruction}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm disabled:bg-gray-300"
                          >
                            Генерация по Pinecone
                          </button>
                          <button
                            onClick={handleUseOpenAI}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium text-sm"
                          >
                            Стандартный путь (OpenAI)
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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

